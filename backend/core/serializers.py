from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from core.models import (Amenity, Application, CommissionRule, Enquiry, Invoice, Listing, ListingAmenity,
                         Location, Notification, Placement, Property, SavedSearch, User, Viewing)
from core.services import commission, places, verification

PROPERTY_TYPES = ["house", "flat", "cottage", "single_room", "shared_room", "backroom", "other"]
FURNISHING = ["furnished", "semi_furnished", "unfurnished"]


def media_url(request, path):
    if not path:
        return None
    # Always a relative link (/media/...). It goes through the website, so it also works from phones and over ngrok.
    return settings.MEDIA_URL + path


class UserSerializer(serializers.ModelSerializer):
    has_password = serializers.SerializerMethodField()

    def get_has_password(self, obj):
        return bool(obj.password) and not obj.password.startswith("!")

    def validate_email(self, value):
        return (value or "").strip().lower() or None

    class Meta:
        model = User
        fields = ["id", "role", "full_name", "phone", "email", "verification_status",
                  "whatsapp_opt_in", "status", "created_at", "has_password"]
        read_only_fields = ["id", "role", "phone", "verification_status", "status", "created_at"]


class LocationSerializer(serializers.ModelSerializer):
    parent_name = serializers.SerializerMethodField()

    def get_parent_name(self, obj):
        return obj.parent.name if obj.parent_id else None

    class Meta:
        model = Location
        fields = ["id", "parent", "parent_name", "name", "type", "latitude", "longitude"]


class AmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Amenity
        fields = ["id", "name", "slug", "category"]


# ------------------------------------------------------- public listings


class ListingPublicSerializer(serializers.ModelSerializer):
    """What any visitor may see. The exact address and landlord phone are never included;
    coordinates are rounded (~100 m) so the map does not reveal the door."""
    location = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    amenities = serializers.SerializerMethodField()
    landlord = serializers.SerializerMethodField()
    lat = serializers.SerializerMethodField()
    lng = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = ["id", "title", "description", "property_type", "rent", "currency", "deposit", "bedrooms",
                  "bathrooms", "furnishing", "available_from", "min_lease_months", "tenant_conditions",
                  "status", "published_at", "location", "lat", "lng", "images", "amenities", "landlord",
                  "distance_km"]

    def get_location(self, obj):
        loc = obj.location
        return {"id": loc.id, "name": loc.name, "city": loc.parent.name if loc.parent_id else None}

    def get_images(self, obj):
        req = self.context.get("request")
        return [media_url(req, i.file_path) for i in obj.images.all()]

    def get_amenities(self, obj):
        return [{"slug": la.amenity.slug, "name": la.amenity.name} for la in obj.listing_amenities.all()]

    def get_landlord(self, obj):
        return {"name": obj.landlord.full_name, "verified": obj.landlord.verification_status == "verified",
                "checks": verification.badges(obj.landlord)}

    def get_lat(self, obj):
        return round(float(obj.latitude), 3) if obj.latitude is not None else None

    def get_lng(self, obj):
        return round(float(obj.longitude), 3) if obj.longitude is not None else None

    def get_distance_km(self, obj):
        d = getattr(obj, "distance_km", None)
        return round(float(d), 1) if d is not None else None


class ListingDetailSerializer(ListingPublicSerializer):
    fee_estimate = serializers.SerializerMethodField()
    my_application = serializers.SerializerMethodField()

    class Meta(ListingPublicSerializer.Meta):
        fields = ListingPublicSerializer.Meta.fields + ["fee_estimate", "my_application"]

    def get_fee_estimate(self, obj):
        return commission.estimate_for_listing(obj)

    def get_my_application(self, obj):
        user = self.context["request"].user
        if not user.is_authenticated or user.role != "tenant":
            return None
        app = Application.objects.filter(listing=obj, tenant=user).first()
        return {"id": app.id, "status": app.status} if app else None


# ---------------------------------------------------- landlord listings


class LandlordListingWriteSerializer(serializers.Serializer):
    city = serializers.CharField(max_length=80)
    suburb = serializers.CharField(max_length=80)
    address_line = serializers.CharField(max_length=255, min_length=5)
    property_type = serializers.ChoiceField(choices=PROPERTY_TYPES)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    title = serializers.CharField(max_length=160, min_length=8)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=3000)
    rent = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("1"))
    currency = serializers.CharField(max_length=3, default="USD")
    deposit = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True, min_value=0)
    bedrooms = serializers.IntegerField(min_value=0, max_value=30, default=1)
    bathrooms = serializers.IntegerField(min_value=0, max_value=30, default=1)
    furnishing = serializers.ChoiceField(choices=FURNISHING, default="unfurnished")
    available_from = serializers.DateField(required=False, allow_null=True)
    min_lease_months = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=60)
    tenant_conditions = serializers.JSONField(required=False, allow_null=True)
    amenities = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)

    PROPERTY_FIELDS = ("address_line", "property_type", "latitude", "longitude")

    def validate_available_from(self, value):
        if value is None or (self.instance is not None and value == self.instance.available_from):
            return value
        today = timezone.localdate()
        if value < today:
            raise serializers.ValidationError("The available-from date cannot be in the past. Leave it empty if the home is available now.")
        if value > today + timedelta(days=365):
            raise serializers.ValidationError("The available-from date is more than a year away.")
        return value

    def _set_amenities(self, listing, slugs):
        ListingAmenity.objects.filter(listing=listing).delete()
        found = Amenity.objects.filter(slug__in=slugs, is_active=True)
        ListingAmenity.objects.bulk_create([ListingAmenity(listing=listing, amenity=a) for a in found])

    @transaction.atomic
    def create(self, validated):
        landlord = self.context["request"].user
        slugs = validated.pop("amenities", [])
        location = places.ensure_location(validated.pop("city"), validated.pop("suburb"))
        prop = Property.objects.create(
            landlord=landlord, location=location, address_line=validated["address_line"],
            property_type=validated["property_type"], latitude=validated.get("latitude"),
            longitude=validated.get("longitude"), description=validated.get("description"))
        listing = Listing.objects.create(
            property=prop, landlord=landlord, location=location,
            property_type=validated["property_type"], latitude=validated.get("latitude"),
            longitude=validated.get("longitude"), title=validated["title"],
            description=validated.get("description"), rent=validated["rent"],
            currency=validated.get("currency", "USD").upper(), deposit=validated.get("deposit"),
            bedrooms=validated.get("bedrooms", 1), bathrooms=validated.get("bathrooms", 1),
            furnishing=validated.get("furnishing", "unfurnished"), available_from=validated.get("available_from"),
            min_lease_months=validated.get("min_lease_months"), tenant_conditions=validated.get("tenant_conditions"),
            status="draft")
        self._set_amenities(listing, slugs)
        return listing

    @transaction.atomic
    def update(self, listing, validated):
        slugs = validated.pop("amenities", None)
        prop = listing.property
        city, suburb = validated.pop("city", None), validated.pop("suburb", None)
        if city is not None or suburb is not None:
            current = listing.location
            location = places.ensure_location(
                city if city is not None else (current.parent.name if current.parent_id else ""),
                suburb if suburb is not None else current.name)
            listing.location = location
            prop.location = location
        for key, value in validated.items():
            if key == "currency":
                value = value.upper()
            setattr(listing, key, value)
            if key in self.PROPERTY_FIELDS or key == "description":
                setattr(prop, key, value)
        listing.save()
        prop.save()
        if slugs is not None:
            self._set_amenities(listing, slugs)
        return listing


class LandlordListingReadSerializer(ListingPublicSerializer):
    address_line = serializers.CharField(source="property.address_line", read_only=True)
    application_count = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()

    class Meta(ListingPublicSerializer.Meta):
        fields = ListingPublicSerializer.Meta.fields + ["address_line", "rejection_reason", "application_count", "photos"]

    def get_photos(self, obj):
        return [{"id": i.id, "url": settings.MEDIA_URL + i.file_path} for i in obj.images.all()]

    def get_lat(self, obj):  # owners see exact coordinates
        return float(obj.latitude) if obj.latitude is not None else None

    def get_lng(self, obj):
        return float(obj.longitude) if obj.longitude is not None else None

    def get_application_count(self, obj):
        return obj.applications.count()


# ------------------------------------------------ workflow and billing


class ApplicationSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()
    tenant = serializers.SerializerMethodField()
    placement_id = serializers.SerializerMethodField()
    placement_status = serializers.SerializerMethodField()
    fee_estimate = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = ["id", "status", "message", "household_size", "desired_move_in", "accepted_at", "respond_by",
                  "created_at", "listing", "tenant", "placement_id", "placement_status", "fee_estimate"]

    def get_listing(self, obj):
        listing = obj.listing
        images = list(listing.images.all())
        return {"id": obj.listing_id, "title": listing.title, "rent": str(listing.rent), "currency": listing.currency,
                "status": listing.status, "available_from": listing.available_from,
                "location": listing.location.name if listing.location_id else None,
                "cover": (settings.MEDIA_URL + images[0].file_path) if images else None}

    def get_placement_status(self, obj):
        p = getattr(obj, "placement", None)
        return p.status if p else None

    def get_tenant(self, obj):
        t = obj.tenant
        return {"id": t.id, "name": t.full_name, "verified": t.verification_status == "verified",
                "checks": verification.badges(t)}

    def get_placement_id(self, obj):
        p = getattr(obj, "placement", None)
        return p.id if p else None

    def get_fee_estimate(self, obj):
        if obj.status != "accepted":
            return None
        return commission.estimate_for_listing(obj.listing)


def _received(invoice):
    """Money received so far, using prefetched payments when available."""
    return sum((p.amount for p in invoice.payments.all() if p.status == "succeeded"), Decimal("0"))


class InvoiceSerializer(serializers.ModelSerializer):
    payer_name = serializers.CharField(source="payer.full_name", read_only=True)
    paid_total = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = ["id", "placement", "payer_role", "payer_name", "invoice_no", "amount", "currency", "due_date",
                  "status", "paid_at", "paid_total", "balance", "payments"]

    def get_paid_total(self, obj):
        return f"{_received(obj):.2f}"

    def get_balance(self, obj):
        return f"{max(Decimal('0'), obj.amount - _received(obj)):.2f}" if obj.status == "unpaid" else "0.00"

    def get_payments(self, obj):
        """Receipts are visible to the person who paid and to admins only."""
        user = getattr(self.context.get("request"), "user", None)
        if not (user and user.is_authenticated and (user.role == "admin" or user.id == obj.payer_id)):
            return []
        out = []
        for p in sorted(obj.payments.all(), key=lambda x: x.id):
            data = p.gateway_payload or {}
            if p.status == "pending" or (p.status == "failed" and not data.get("reversed")):
                continue
            out.append({"id": p.id, "amount": str(p.amount), "method": p.method, "receipt_no": p.gateway_reference,
                        "status": "reversed" if data.get("reversed") else p.status, "paid_at": p.paid_at,
                        "received_by": data.get("received_by_name"), "note": data.get("note"),
                        "reversal_reason": data.get("reversal_reason")})
        return out


class PlacementSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()
    invoices = InvoiceSerializer(many=True, read_only=True)
    contacts = serializers.SerializerMethodField()
    landlord_name = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    collected = serializers.SerializerMethodField()
    outstanding = serializers.SerializerMethodField()

    class Meta:
        model = Placement
        fields = ["id", "status", "currency", "first_rent", "total_fee", "landlord_fee", "tenant_fee",
                  "rule_snapshot", "confirmed_at", "payment_deadline", "contacts_released_at", "move_in_date",
                  "cancel_reason", "listing", "invoices", "contacts", "landlord_name", "tenant_name",
                  "collected", "outstanding"]

    def _is_admin(self):
        user = getattr(self.context.get("request"), "user", None)
        return bool(user and user.is_authenticated and user.role == "admin")

    def get_landlord_name(self, obj):
        return obj.landlord.full_name if self._is_admin() else None

    def get_tenant_name(self, obj):
        return obj.tenant.full_name if self._is_admin() else None

    def get_collected(self, obj):
        return f"{sum((_received(i) for i in obj.invoices.all()), Decimal('0')):.2f}"

    def get_outstanding(self, obj):
        if obj.status not in ("awaiting_payment", "part_paid"):
            return "0.00"
        return f"{sum((max(Decimal('0'), i.amount - _received(i)) for i in obj.invoices.all() if i.status == 'unpaid'), Decimal('0')):.2f}"

    def get_listing(self, obj):
        return {"id": obj.listing_id, "title": obj.listing.title}

    def get_contacts(self, obj):
        """Phone numbers and the exact address appear only after release."""
        if not obj.contacts_released_at:
            return None
        me = self.context["request"].user
        other = obj.landlord if me.id == obj.tenant_id else obj.tenant
        data = {"name": other.full_name, "phone": other.phone}
        if me.id == obj.tenant_id:
            data["address"] = obj.listing.property.address_line
        return data


class EnquirySerializer(serializers.ModelSerializer):
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)

    class Meta:
        model = Enquiry
        fields = ["id", "listing", "listing_title", "tenant_name", "message", "reply", "status", "created_at"]
        read_only_fields = ["id", "listing", "reply", "status", "created_at"]


class ViewingSerializer(serializers.ModelSerializer):
    listing_title = serializers.CharField(source="listing.title", read_only=True)
    tenant_name = serializers.CharField(source="tenant.full_name", read_only=True)

    class Meta:
        model = Viewing
        fields = ["id", "listing", "listing_title", "tenant_name", "proposed_at", "confirmed_at", "status", "note"]
        read_only_fields = ["id", "listing", "confirmed_at", "status", "created_at"]


class SavedSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSearch
        fields = ["id", "name", "filters", "alert_channel", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "event", "title", "body", "related_type", "related_id", "status", "read_at", "created_at"]


class CommissionRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionRule
        fields = ["id", "name", "fee_type", "value", "min_fee", "max_fee", "landlord_share_pct",
                  "tenant_share_pct", "scope_type", "scope", "rent_min", "rent_max", "currency", "priority",
                  "effective_from", "effective_to", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        if get("fee_type") not in ("percentage", "flat"):
            raise serializers.ValidationError({"fee_type": "Must be percentage or flat."})
        if Decimal(get("landlord_share_pct")) + Decimal(get("tenant_share_pct")) != Decimal(100):
            raise serializers.ValidationError("Landlord and tenant shares must add up to 100.")
        if get("fee_type") == "percentage" and Decimal(get("value")) > 100:
            raise serializers.ValidationError({"value": "A percentage cannot exceed 100."})
        scope_type, scope = get("scope_type"), get("scope")
        if scope_type == "global" and scope is not None:
            raise serializers.ValidationError({"scope": "A global rule has no location."})
        if scope_type in ("city", "suburb"):
            if scope is None:
                raise serializers.ValidationError({"scope": "Choose a location for this scope."})
            if scope.type != scope_type:
                raise serializers.ValidationError({"scope": f"Location must be of type {scope_type}."})
        lo, hi = get("min_fee"), get("max_fee")
        if lo is not None and hi is not None and lo > hi:
            raise serializers.ValidationError("Minimum fee cannot exceed maximum fee.")
        return attrs
