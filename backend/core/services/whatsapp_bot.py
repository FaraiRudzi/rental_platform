"""Guided WhatsApp bot: search by tapping (area > bedrooms > max rent), view, apply, and
let landlords / tenants answer the notification buttons (accept, reject, confirm, decline).

Free-form messages and interactive buttons only work inside WhatsApp's 24h window, which
opens whenever the user messages us; the bot only ever replies to inbound messages.
"""
from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from core.exceptions import WorkflowError
from core.models import Listing, Location, SavedSearch, SearchLog, User, WhatsAppSession
from core.search import apply_listing_filters
from core.services import workflow, whatsapp

PAGE = 3
GREETINGS = {"hi", "hello", "hey", "menu", "start", "search", "restart", "home"}


def app_url():
    return settings.RENTAL.get("APP_URL", "")


def _extract(msg):
    """Returns (action_id, text). Interactive replies and template buttons give an action id."""
    t = msg.get("type")
    if t == "text":
        return None, (msg.get("text", {}).get("body") or "").strip()
    if t == "interactive":
        inter = msg.get("interactive", {})
        reply = inter.get("button_reply") or inter.get("list_reply") or {}
        return reply.get("id"), reply.get("title", "")
    if t == "button":  # quick-reply button on a template message
        return msg.get("button", {}).get("payload"), msg.get("button", {}).get("text", "")
    return None, ""


def handle_message(msg, wa_id, profile_name=None):
    if not wa_id:
        return
    phone = "+" + wa_id
    session, _ = WhatsAppSession.objects.get_or_create(phone=phone)
    ctx = session.context or {}
    if msg.get("id") and ctx.get("last_msg_id") == msg["id"]:
        return  # duplicate delivery from Meta
    ctx["last_msg_id"] = msg.get("id")
    now = timezone.now()
    session.last_inbound_at, session.window_expires_at = now, now + timedelta(hours=24)
    user = User.objects.filter(phone=phone, status="active").first()
    session.user = user

    action, text = _extract(msg)
    try:
        if action:
            _route_action(phone, user, session, ctx, action)
        elif text.lower() in GREETINGS or session.state == "start":
            _ask_area(phone, session, ctx)
        elif session.state == "ask_rent" and text.replace("$", "").strip().isdigit():
            ctx["max_rent"] = int(text.replace("$", "").strip())
            _show_results(phone, session, ctx, offset=0)
        else:
            whatsapp.send_text(phone, "Reply *menu* to search for a home, or use the buttons in the messages I send.")
    except WorkflowError as exc:
        whatsapp.send_text(phone, str(exc))
    finally:
        session.context = ctx
        session.save()


def _route_action(phone, user, session, ctx, action):
    kind, _, arg = action.partition(":")
    if kind == "area":
        ctx.update(location=int(arg), bedrooms=None, max_rent=None, offset=0)
        session.state = "ask_beds"
        whatsapp.send_buttons(phone, "How many bedrooms (at least)?", [("beds:1", "1+"), ("beds:2", "2+"), ("beds:3", "3+")])
    elif kind == "beds":
        ctx["bedrooms"] = int(arg)
        session.state = "ask_rent"
        whatsapp.send_buttons(phone, "Maximum rent per month? (or type a number)",
                              [("rent:150", "Up to 150"), ("rent:250", "Up to 250"), ("rent:400", "Up to 400")])
    elif kind == "rent":
        ctx["max_rent"] = int(arg)
        _show_results(phone, session, ctx, offset=0)
    elif kind == "more":
        _show_results(phone, session, ctx, offset=int(ctx.get("offset", 0)) + PAGE)
    elif kind == "new":
        _ask_area(phone, session, ctx)
    elif kind == "save":
        if not user or user.role != "tenant":
            whatsapp.send_text(phone, f"Create a tenant account to save searches: {app_url()}")
        else:
            SavedSearch.objects.create(user=user, name="WhatsApp search", alert_channel="whatsapp",
                                       filters=_filters(ctx))
            whatsapp.send_text(phone, "Saved. I'll message you when a matching home is listed.")
    elif kind == "view":
        listing = Listing.objects.select_related("location").filter(pk=int(arg), status="published").first()
        if not listing:
            whatsapp.send_text(phone, "That home is no longer available.")
            return
        whatsapp.send_buttons(phone, _describe(listing, long=True), [(f"apply:{listing.id}", "Apply")])
    elif kind == "apply":
        _apply(phone, user, int(arg))
    elif kind == "acc" and user and user.role == "landlord":
        app = workflow.accept_application(user, int(arg))
        whatsapp.send_text(phone, f"Accepted. {app.tenant.full_name} has been notified.")
    elif kind == "rej" and user and user.role == "landlord":
        workflow.reject_application(user, int(arg))
        whatsapp.send_text(phone, "Application rejected.")
    elif kind == "conf" and user and user.role == "tenant":
        p = workflow.confirm_acceptance(user, int(arg))
        whatsapp.send_text(phone, f"Confirmed! Your fee share is {p.currency} {p.tenant_fee}, due by "
                                  f"{workflow.fmt_dt(p.payment_deadline)}. Pay in the app: {app_url()}")
    elif kind == "decl" and user and user.role == "tenant":
        workflow.decline_acceptance(user, int(arg))
        whatsapp.send_text(phone, "Okay, declined.")
    else:
        whatsapp.send_text(phone, "Sorry, I could not do that. Reply *menu* to start again.")


def _ask_area(phone, session, ctx):
    ctx.clear()
    session.state = "ask_area"
    rows = (Location.objects.filter(type="suburb", is_active=True)
            .annotate(n=Count("listings", filter=Q(listings__status="published")))
            .filter(n__gt=0).order_by("-n")[:10])
    if not rows:
        whatsapp.send_text(phone, "No homes are listed yet. Please check back soon.")
        return
    whatsapp.send_list(phone, "Which area are you looking in?", "Choose area",
                       [(f"area:{r.id}", r.name, f"{r.n} available") for r in rows])


def _filters(ctx):
    f = {"location": ctx.get("location")}
    if ctx.get("bedrooms"):
        f["bedrooms"] = ctx["bedrooms"]
    if ctx.get("max_rent"):
        f["max_rent"] = ctx["max_rent"]
    return f


def _describe(listing, long=False):
    base = (f"*{listing.title}*\n{listing.currency} {listing.rent}/month\n"
            f"{listing.bedrooms} bed, {listing.bathrooms} bath · {listing.location.name}")
    if long:
        base += f"\n{(listing.description or '')[:400]}\nAvailable: {listing.available_from or 'now'}"
    return base


def _show_results(phone, session, ctx, offset):
    filters = _filters(ctx)
    qs = apply_listing_filters(Listing.objects.filter(status="published").select_related("location"), filters)
    total = qs.count()
    SearchLog.objects.create(user=session.user, channel="whatsapp", filters=filters, result_count=total)
    ctx["offset"], session.state = offset, "results"
    if total == 0:
        whatsapp.send_buttons(phone, "No homes match that yet. Try a higher budget or another area.",
                              [("new:1", "New search"), ("save:1", "Alert me")])
        return
    for listing in qs[offset: offset + PAGE]:
        whatsapp.send_buttons(phone, _describe(listing), [(f"view:{listing.id}", "Details"), (f"apply:{listing.id}", "Apply")])
    more = [("more:1", "More")] if offset + PAGE < total else []
    whatsapp.send_buttons(phone, f"Showing {min(offset + PAGE, total)} of {total}.",
                          more + [("save:1", "Alert me"), ("new:1", "New search")])


def _apply(phone, user, listing_id):
    if not user:
        whatsapp.send_text(phone, f"Create a free tenant account first, then apply: {app_url()}")
        return
    listing = Listing.objects.select_related("landlord", "location").filter(pk=listing_id).first()
    if not listing:
        whatsapp.send_text(phone, "That home was not found.")
        return
    workflow.apply_for_listing(user, listing, message="Applied via WhatsApp")
    whatsapp.send_text(phone, f"Application sent for {listing.title}. We'll tell you as soon as the landlord responds.")
