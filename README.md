# Rental Platform: Django REST + React

Landlords list homes, tenants search and apply, the landlord accepts, the tenant confirms, and the
platform earns a **placement fee split between both sides**, calculated from the first month's rent using
**admin-editable rules**. Works from the website, an Android app (Capacitor) and a WhatsApp bot.

```
backend/    Django 5 + Django REST Framework + Celery   (talks to your existing MySQL database)
frontend/   Next.js 14 (React 18)                       (tenant, landlord and admin screens)
```

## 0. Database name

Use **`rental_platform`** (lowercase, underscore). A name with a space needs backticks everywhere.

```sql
CREATE DATABASE rental_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- then load the schema file:   mysql -u root -p rental_platform < rental_platform_schema.sql
```

The Django models are mapped onto those tables with `managed = False`: **Django never creates or alters
your tables**, so `rental_platform_schema.sql` stays the single source of truth. MySQL 8.0.16+ is
recommended. **MariaDB 10.4 (bundled with XAMPP) works with the pinned Django 5.0.x.** Django 5.1 and newer need MariaDB 10.5+ or MySQL 8, so if you upgrade your database you can also upgrade Django.

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
- Everyone logs in with **email or phone + password**. There are no SMS codes. Password-reset emails are printed in the
  backend window while `EMAIL_BACKEND` is the console backend (development); set the `EMAIL_*` values for real email.
- `CELERY_EAGER=True` runs background jobs inline, so you do not need Redis to start.

### Production background work
```bash
celery -A rental_platform worker -l info     # sends push / WhatsApp / SMS fallback
celery -A rental_platform beat   -l info     # runs deadline checks every 15 minutes
# or without Celery beat:  cron  */15 * * * *  python manage.py process_deadlines
```
Set `CELERY_EAGER=False` and `REDIS_URL` in production.

## 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```
Needs Node.js 18.17 or newer. The site is Next.js 14 (App Router, React 18). The website forwards `/api/*` and
`/media/*` to Django (`API_INTERNAL_URL`, default `http://127.0.0.1:8000`; see `frontend/.env.example`), so the browser only
ever talks to the website. Branding (logo, colours, wording) is read from the backend on every request, so changes made in
**Admin > Settings** show immediately. For a production build: `npm run build`, then `npm run start`.

## 3. First run, end to end

1. Log in at `/login` with the admin email (or phone) and password you gave `create_admin`.
   Open **Admin > Fee rules** and check the starter rule (10%, 60/40). Edit it if you want.
2. Open a private window and sign up as a **landlord** at `/register`. You are sent to the Verification page: upload ID and
   ownership documents. Then add a listing with a photo and submit it for review.
3. As admin: **Admin > Verification** (approve the documents) and **Admin > Listing review > Approve**.
4. Sign up as a **tenant** in another window, find the listing, and apply.
5. Landlord: **Applications > Accept**. The tenant gets an in-app alert, push (if FCM is set up), WhatsApp (if set up) and an
   SMS fallback.
6. Tenant: **My applications > Confirm and continue**. The fee is calculated, snapshotted and two invoices are created.
7. Both pay (**Pay now**). In development use **Admin > Placements > Record cash payment**. When both are paid the contacts
   and address unlock.

## 3b. Creating accounts in Django admin (admins, landlords, tenants)

1. Make sure an admin exists: `create_admin.bat` (or `python manage.py create_admin +263771234567 "Your Name" --password "..." --email you@example.com`).
2. Open **http://127.0.0.1:8000/admin/** and log in with that **phone number** and password.
3. **Users > Add user.** Enter the phone in international format (`+263...`), full name, email (required for tenants and
   landlords), role and a password (at least 8 characters). Everyone logs in with a password, so tell the person what it is;
   they can change it under **My account**.
4. Log in to the website (`http://localhost:5173/login`) with the email or phone plus the password.

Django admin also lets you add locations and amenities, and browse listings, applications, placements, invoices, payments, the
ledger, notifications and verification documents read-only. Accounts cannot be deleted (they own money records); use **Suspend**.

## 3c. Branding and theme

Everything below can be changed from **Admin > Settings** without touching any file (see 3g). The defaults live in
`frontend/public/` (`logo.png`, `logo-white.png`, `logo-mark.png`, `favicon.png`, `login-bg.jpg`) and in the variables at the top
of `frontend/src/app/globals.css`. The theme is light-only on purpose, because a logo with dark lettering would disappear on a
dark background.

**Alerts** clear when read, when you click "Mark all as read", and automatically once the item they point at has been dealt with
(an application accepted, a fee paid, an enquiry answered).

## 3d. Sign-up and login (password only)

People create their own accounts at **/register**:
1. Choose **tenant** or **landlord** (or arrive with `?role=tenant` / `?role=landlord`).
2. Enter name, phone (international format), **email** and a **password** (at least 8 characters, not a common password),
   tick the WhatsApp-alerts box if wanted, and confirm they understand the shared placement fee. The account is created and they
   are logged in (tenants land on the search page, new landlords on the Verification page).

They log in at **/login** with **email or phone number + password**. After 8 wrong attempts for the same login the account is
locked for 15 minutes. **Forgot password** emails a one-hour reset link (`/forgot-password`, `/reset-password`). Phone numbers are
not verified by SMS any more: identity is established through the document verification (3e).

Without an account, anyone can browse and view listings. Applying, asking a question, requesting a viewing, saving searches and
listing a home all need an account. "Create a free account" buttons appear in the header, on the search banner and on every
listing page, and they return people to what they were doing (`?next=`). Admins can only be created by an existing admin.

## 3e. Document verification (upload and admin review)

**Users upload.** Tenants and landlords open **Verification** in the menu (new landlords are sent there right after
signing up). Each role has a checklist:

| Role | Required | Optional |
|---|---|---|
| Landlord | Identity (national ID or passport); Ownership or authority to let (title deed, rates bill, lease, or an owner's letter of authority) | Proof of address |
| Tenant | Identity (national ID or passport) | Employer letter or payslip; proof of address |

They can upload JPG, PNG or PDF files (max 5 MB), view them, and remove one that is still pending or rejected. The server
checks the real file contents (not just the name), straightens and shrinks phone photos, and stores files **privately** in
`backend/media/private/docs/`. They are never served as public media. **Back this folder up** along with the database.

**Admins review.** Open **Admin > Verification**. A red badge shows how many people are waiting, and it clears once you open the
tab. Each person's card shows their required and optional checks, and every document can be opened in the page. Approve or
reject each document; **a rejection needs a reason**, which is sent to the user so they can upload a better copy. When all
required documents are approved the account becomes **verified** automatically. A manual override for the whole account is under
"Manual override". Every decision is written to the audit log.

**Specific badges.** Instead of one bare "verified", other users see only what was actually checked, for example "ID verified" and
"Ownership verified" on a landlord's listing, or "ID verified" and "Income checked" on a tenant's application. The documents
themselves are never shown to other users.

**Optional rule.** Set `REQUIRE_VERIFIED_LANDLORD=True` in `backend/.env` to stop landlords submitting listings until they have
uploaded their documents (verified or pending review). It is off by default.

Not included yet: automated ID and selfie matching through a provider, document expiry dates, and credit or police-clearance
checks. Those need third-party services and are separate steps.

## 3f. Sign in with Google and Facebook

The buttons appear on the login and sign-up pages as soon as the keys exist in `backend/.env`. Restart the backend afterwards.

**Google**
1. Open https://console.cloud.google.com/ > *APIs & Services* > *Credentials* > *Create credentials* > *OAuth client ID*
   (configure the consent screen first if asked) > type **Web application**.
2. Under *Authorised JavaScript origins* add `http://localhost:5173` and, later, your live site (`https://yourdomain.com`).
3. Copy the **Client ID** into `GOOGLE_CLIENT_ID=` in `backend/.env`.

**Facebook**
1. Open https://developers.facebook.com/ > *My Apps* > *Create app* > add the product **Facebook Login** (Web).
2. *Settings > Basic*: copy **App ID** and **App Secret** into `FACEBOOK_APP_ID=` and `FACEBOOK_APP_SECRET=` in `backend/.env`.
3. *Facebook Login > Settings*: add your site (`http://localhost:5173` while testing, `https://yourdomain.com` live) to the allowed
   domains / redirect URIs. Facebook requires HTTPS for live sites.
4. While the app is in *Development* mode only you and added testers can use it. Switch it to *Live* when ready (the
   `public_profile` and `email` permissions need no review).

**How it behaves.** The server checks the Google or Facebook token itself. A person whose verified email matches an existing account
is logged in to it. A brand-new person is asked for their phone number and role, then the account is created without a password
(they can set one under **My account**). Administrator accounts can never use social sign-in.

## 3g. Settings page (logo, colours, wording)

**Admin > Settings** (`/admin/settings`) lets an admin change, with a live preview and without editing files:
- **Images:** logo, a version for dark backgrounds (made automatically from the logo unless you upload one), a square icon (phones,
  footer, browser tab) and the login background. JPG logos on a white background get the white removed automatically.
- **Colours:** the main colour and the dark colour; every button, badge, banner and shadow follows them.
- **Wording:** site name, tagline, company name, footer line, the search page headline and subtitle, support email and phone.
- **Sign-ups:** a switch to close new sign-ups, plus a read-only status of the Google and Facebook connection.

Settings are stored in a `site_settings` table that `migrate` creates (`setup_backend.bat` does this), and uploaded images in
`backend/media/site/`. Back both up with the database.

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

The website reads its branding from the server, so the Android app is a thin Capacitor shell that opens your **live website**:
```bash
mkdir android-app && cd android-app
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/push-notifications
npx cap init "Rental Platform" com.yourcompany.rental --web-dir=www
mkdir www && echo "<html></html>" > www/index.html
# edit capacitor.config.json and add:  "server": { "url": "https://your-live-site.com" }
npx cap add android && npx cap sync && npx cap open android
```
On first login the app should request push permission and `POST /api/me/devices/ {"fcm_token": "..."}`.

## 7. API map (all under `/api/`)

| Area | Endpoints |
|---|---|
| Auth | `auth/register/`, `auth/login/` (email or phone + password), `auth/social/`, `auth/social/complete/`, `auth/forgot/`, `auth/reset/`, `auth/token/refresh/`, `me/`, `me/password/`, `me/devices/` |
| Site | `site/` (public branding), `admin/settings/`, `admin/settings/image/{key}/` |
| Search | `listings/` (filters: `location, min_rent, max_rent, bedrooms, bathrooms, type, furnishing, amenities, available_by, verified, q, lat, lng, radius_km, sort`), `listings/{id}/`, `locations/`, `amenities/` |
| Tenant | `listings/{id}/apply/`, `/enquiries/`, `/viewings/`, `/favourite/`, `me/applications/`, `applications/{id}/confirm/`, `/decline/`, `/withdraw/`, `me/saved-searches/` |
| Landlord | `landlord/listings/` (+ `/submit/`, `/images/`, `/archive/`), `landlord/applications/` (+ `/accept/`, `/reject/`), `landlord/enquiries/`, `landlord/viewings/` |
| Billing | `placements/`, `placements/{id}/`, `invoices/`, `invoices/{id}/pay/` |
| Verification | `me/verification/`, `me/verification-docs/` (+ `{id}/`, `{id}/file/`) |
| Admin | `admin/commission-rules/` (+ `/audit/`), `admin/listings/` (+ `/review/`), `admin/users/`, `admin/verification/` (queue), `admin/verification-docs/{id}/review/`, `admin/placements/`, `admin/invoices/{id}/record-payment/` and `/waive/`, `admin/stats/` |
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

## 9. Upgrading from the React (Vite) version

The old `frontend` folder must be **deleted** before the Next.js one is put in place (it has no data in it; your accounts and
listings live in the database). Then run `setup_backend.bat` again (it creates the new `site_settings` table), run
`run_frontend.bat` (installs the new packages), and **set a password for every existing account**: people who used to log in with
an SMS code have none. Anyone with an email address can use *Forgot your password?*; for the rest, set a password in Django admin.
