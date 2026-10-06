# Rental Platform: Django REST + React

Landlords list homes, tenants search and apply, the landlord accepts, the tenant confirms, and the
platform earns a **placement fee split between both sides**, calculated from the first month's rent using
**admin-editable rules**. Works from the website, an Android app (Capacitor) and a WhatsApp bot.

```
backend/    Django 5 + Django REST Framework + Celery   (talks to your existing MySQL database)
frontend/   React 18 + Vite                             (tenant, landlord and admin screens)
```

## 0. Database name

Use **`rental_platform`** (lowercase, underscore). A name with a space needs backticks everywhere.

```sql
CREATE DATABASE rental_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- then load the schema file:   mysql -u root -p rental_platform < rental_platform_schema.sql
```

The Django models are mapped onto those tables with `managed = False`: **Django never creates or alters
your tables**, so `rental_platform_schema.sql` stays the single source of truth. MySQL 8.0.16+ is
recommended. MariaDB 10.5+ also works.

## 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Windows      (Linux/macOS: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env           # Linux/macOS: cp .env.example .env   then edit DB_PASSWORD etc.

python manage.py makemigrations core   # records the (unmanaged) models. No table changes
python manage.py migrate               # creates only Django's own bookkeeping tables
python manage.py create_admin +263771234567 "Your Name" --password "ChangeMe!234"
python manage.py add_location "Harare" --suburbs "Avondale,Borrowdale,Mabelreign"
python manage.py runserver
```

Notes
- `mysqlclient` needs a C compiler on Windows. If install fails: `pip install PyMySQL` and uncomment the two
  `pymysql` lines in `backend/rental_platform/__init__.py`.
- Replace the example city/suburbs with your own launch area. Suburbs are what tenants search by.
- With `SMS_DRIVER=log` (the development default), no text message is sent; the OTP is shown in the
  signup page and printed in the Django terminal. For other providers, use Twilio as described below,
  or set `SMS_DRIVER=http` and adapt `core/services/sms.py` to the provider's API format.
- For Twilio, set `SMS_DRIVER=twilio` and configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
  `TWILIO_FROM` in `backend/.env`. `TWILIO_FROM` must be a sender authorized for your Twilio account.
  Restart Django after changing `.env`. Never commit the real `.env` or share its credentials.
- `CELERY_EAGER=True` runs background jobs inline, so you do not need Redis to start.

### Production background work
```bash
celery -A rental_platform worker -l info     # sends push / WhatsApp / SMS fallback
celery -A rental_platform beat   -l info     # runs deadline checks every 15 minutes
# or without Celery beat:  cron  */15 * * * *  python manage.py process_deadlines
```
Set `CELERY_EAGER=False` and `REDIS_URL` in production.

## 2. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api and /media to Django on :8000)
```

The admin dashboard is part of the frontend: open `http://localhost:5173/admin` and sign in with
the account created by `python manage.py create_admin`. Django on port 8000 serves the API and
media files; it does not provide a Django admin site at `/admin/`.

## 3. First run, end to end

1. Log in at `/login` with the admin phone and password (use the "Admin? Log in with password" link).
   Open **Admin > Fee rules** and check the starter rule (10%, 60/40). Edit it if you want.
2. Open a private window, sign up as a **landlord** (OTP appears in the Django terminal). Add a listing with
   a photo and submit it for review.
3. As admin: **Admin > Listing review > Approve**. The listing is now public.
4. Sign up as a **tenant** in another window, find the listing, and apply.
5. Landlord: **Applications > Accept**. The tenant gets an in-app alert, push (if FCM set up), WhatsApp
   (if set up) and an SMS fallback.
6. Tenant: **My applications > Confirm**. The fee is calculated, snapshotted and two invoices are created.
7. Both pay (**Pay now**). In development, simulate the gateway callback or use **Admin > Placements >
   Record cash payment**. When both are paid the contacts and address unlock.

## 4. How the money works

- `resolve_rule()` picks the most specific active rule: suburb, then city, then global, then priority.
- `total = rent x % (or flat)`, clamped to min and max. `tenant = round(total x tenant%)`, `landlord = total - tenant`,
  so the shares always add up exactly.
- At confirmation the rule is **copied into `placements.rule_snapshot`**. Later rule edits never change an
  existing placement. Rules are never hard-deleted, only deactivated, and every change is audited.
- Every money event is a row in `ledger_entries`. The database blocks edits and deletes on that table.
- Fee is due at **confirmed**, never at accepted.
- Unpaid placements are cancelled automatically after `RENTAL_PAYMENT_DEADLINE_HOURS`; paid shares are
  marked `refunded`. **Returning the actual money is done by an admin in your payment provider.**
- `RENTAL_RELEASE_CONTACTS_WHEN=both_paid` (default) hides phone numbers and the exact address until both
  shares are paid. Set to `confirmed` to release earlier.

## 5. Things you must connect

| What | Where | Notes |
|---|---|---|
| **SMS provider** | `core/services/sms.py` | Set `SMS_DRIVER=http`, URL and token, and adapt the JSON payload to your provider. |
| **Payment gateway** | `core/services/billing.py` > `initiate_payment()` | Replace the marked block with your gateway call. The gateway then POSTs to `/api/webhooks/payments/` with `{"reference","status","amount"}` and header `X-Signature` = HMAC-SHA256 of the raw body using `PAYMENT_WEBHOOK_SECRET`. |
| **WhatsApp** | `.env` + Meta Business Manager | Webhook URL `/api/webhooks/whatsapp/`, set `WHATSAPP_*`. Create the templates below. |
| **Android push** | `.env` | Firebase project, service-account JSON, `FCM_ENABLED=True`. App registers its token with `POST /api/me/devices/`. |

### WhatsApp templates to approve (names configurable in `settings.py`)

| Template | Body variables | Quick-reply buttons (payload sent by us) |
|---|---|---|
| `application_received` | {{1}} landlord name, {{2}} tenant name, {{3}} listing | Accept (`acc:ID`), Reject (`rej:ID`) |
| `application_accepted` | {{1}} tenant name, {{2}} listing, {{3}} confirm-by time | Confirm (`conf:ID`), Decline (`decl:ID`) |
| `placement_confirmed` | {{1}} name, {{2}} listing, {{3}} your fee share, {{4}} due time | none |
| `contacts_released` | {{1}} name, {{2}} listing | none |
| `saved_search_match` | {{1}} name, {{2}} listing, {{3}} rent | none |

Business-initiated WhatsApp messages must be pre-approved templates. Free-form replies and the guided
search (area > bedrooms > rent) work inside the 24-hour window after a user messages the bot.

## 6. Android app

The React app is mobile-first, so wrap it:
```bash
cd frontend
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/push-notifications
npx cap init "Rental Platform" com.yourcompany.rental --web-dir=dist
# set VITE_API_URL to your public API origin, then:
npm run build && npx cap add android && npx cap sync && npx cap open android
```
On first login the app should request push permission and `POST /api/me/devices/ {"fcm_token": "..."}`.

## 7. API map (all under `/api/`)

| Area | Endpoints |
|---|---|
| Auth | `auth/otp/request/`, `auth/otp/verify/`, `auth/login/` (password), `auth/token/refresh/`, `me/`, `me/devices/`, `me/verification-docs/` |
| Search | `listings/` (filters: `location, min_rent, max_rent, bedrooms, bathrooms, type, furnishing, amenities, available_by, verified, q, lat, lng, radius_km, sort`), `listings/{id}/`, `locations/`, `amenities/` |
| Tenant | `listings/{id}/apply/`, `/enquiries/`, `/viewings/`, `/favourite/`, `me/applications/`, `applications/{id}/confirm/`, `/decline/`, `/withdraw/`, `me/saved-searches/` |
| Landlord | `landlord/listings/` (+ `/submit/`, `/images/`, `/archive/`), `landlord/applications/` (+ `/accept/`, `/reject/`), `landlord/enquiries/`, `landlord/viewings/` |
| Billing | `placements/`, `placements/{id}/`, `invoices/`, `invoices/{id}/pay/` |
| Admin | `admin/commission-rules/` (+ `/audit/`), `admin/listings/` (+ `/review/`), `admin/users/`, `admin/verification-docs/`, `admin/placements/`, `admin/invoices/{id}/record-payment/` and `/waive/`, `admin/stats/` |
| Webhooks | `webhooks/whatsapp/`, `webhooks/payments/` |

## 8. Honest status and production checklist

This code was written carefully but **has not been executed against a live database or Django install**
(no network or PHP/Django runtime was available where it was generated). Expect to fix small issues on first
run, then test the full flow in section 3 before trusting it with real money. Specifically test the fee
maths, the payment webhook and the WhatsApp webhook against your real accounts.

Before going live:
- `DEBUG=False`, a real `SECRET_KEY`, `ALLOWED_HOSTS`, HTTPS.
- Serve only `media/listings/` publicly. Keep `media/private/` (ID documents) off the web server.
- Use a shared cache (Redis) for rate limiting. Back up the database nightly.
- Check whether charging a placement fee needs an estate-agent licence where you operate, and get a
  privacy policy in place, since you store IDs and rental histories.
- Pagination, image resizing, throttling and the leakage report are in; **search caching** and
  **payment reminders** are not yet.
