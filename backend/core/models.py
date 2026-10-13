"""
Models mapped onto the tables created by rental_platform_schema.sql.

Every model is managed = False: Django reads and writes the tables but never
creates or alters them. Keep the SQL file as the single source of truth.

Link tables with composite primary keys (listing_amenities, favourites) mark
`listing` as primary_key=True. Django has no composite keys, so this is a
deliberate shortcut: use .filter(...), .create(...) and .delete() on them, never
.get(pk=...) or .save() on an existing row.
"""
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.utils import timezone


class UnsignedBigAutoField(models.BigAutoField):
    """users.id is BIGINT UNSIGNED. Tables Django itself creates with a foreign key to users
    (django_admin_log) must use the same column type, or MySQL/MariaDB rejects the constraint."""

    def rel_db_type(self, connection):
        return "bigint UNSIGNED"


class Unmanaged(models.Model):
    class Meta:
        abstract = True
        managed = False


# ---------------------------------------------------------------- users


class UserManager(BaseUserManager):
    def create_user(self, phone, password=None, **extra):
        user = self.model(phone=phone, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra):
        extra.setdefault("role", "admin")
        extra.setdefault("phone_verified_at", timezone.now())
        extra.setdefault("verification_status", "verified")
        return self.create_user(phone, password, **extra)


class User(AbstractBaseUser, Unmanaged):
    id = UnsignedBigAutoField(primary_key=True)
    role = models.CharField(max_length=10)  # tenant | landlord | admin
    full_name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, unique=True)
    email = models.CharField(max_length=190, null=True, blank=True, unique=True)
    password = models.CharField(max_length=255, null=True, blank=True, db_column="password_hash")
    last_login = models.DateTimeField(null=True, blank=True, db_column="last_login_at")
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    verification_status = models.CharField(max_length=12, default="unverified")
    whatsapp_opt_in = models.BooleanField(default=False)
    status = models.CharField(max_length=10, default="active")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS = ["full_name", "role"]
    objects = UserManager()

    class Meta(Unmanaged.Meta):
        db_table = "users"

    @property
    def is_active(self):
        return self.status == "active"

    @property
    def is_admin(self):
        return self.role == "admin"

    # --- what Django's admin site needs. Admins (role = 'admin') get full access.
    @property
    def is_staff(self):
        return self.role == "admin" and self.is_active

    @property
    def is_superuser(self):
        return self.role == "admin"

    def has_perm(self, perm, obj=None):
        return self.is_active and self.role == "admin"

    def has_perms(self, perm_list, obj=None):
        return all(self.has_perm(p, obj) for p in perm_list)

    def has_module_perms(self, app_label):
        return self.is_active and self.role == "admin"

    @property
    def is_verified(self):
        return self.verification_status == "verified"

    def __str__(self):
        return f"{self.full_name} ({self.role})"


class OtpCode(Unmanaged):
    phone = models.CharField(max_length=20)
    code_hash = models.CharField(max_length=255)
    purpose = models.CharField(max_length=15)
    attempts = models.PositiveSmallIntegerField(default=0)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "otp_codes"


class VerificationDoc(Unmanaged):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="verification_docs")
    doc_type = models.CharField(max_length=30)
    file_path = models.CharField(max_length=500)
    status = models.CharField(max_length=10, default="pending")
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                    db_column="reviewed_by", related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "verification_docs"


class DeviceToken(Unmanaged):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="device_tokens")
    fcm_token = models.CharField(max_length=500)
    platform = models.CharField(max_length=10, default="android")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "device_tokens"


# ------------------------------------------------- locations and listings


class Location(Unmanaged):
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=10)  # country | region | city | suburb
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(Unmanaged.Meta):
        db_table = "locations"

    def __str__(self):
        return self.name


class Property(Unmanaged):
    landlord = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="+")
    address_line = models.CharField(max_length=255)
    property_type = models.CharField(max_length=15)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(Unmanaged.Meta):
        db_table = "properties"


class Amenity(Unmanaged):
    name = models.CharField(max_length=80)
    slug = models.CharField(max_length=80, unique=True)
    category = models.CharField(max_length=40, null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta(Unmanaged.Meta):
        db_table = "amenities"


class Listing(Unmanaged):
    property = models.ForeignKey(Property, on_delete=models.PROTECT, related_name="listings")
    landlord = models.ForeignKey(User, on_delete=models.PROTECT, related_name="listings")
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name="listings")
    property_type = models.CharField(max_length=15)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    title = models.CharField(max_length=160)
    description = models.TextField(null=True, blank=True)
    rent = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    deposit = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    bedrooms = models.PositiveSmallIntegerField(default=1)
    bathrooms = models.PositiveSmallIntegerField(default=1)
    furnishing = models.CharField(max_length=15, default="unfurnished")
    available_from = models.DateField(null=True, blank=True)
    min_lease_months = models.PositiveSmallIntegerField(null=True, blank=True)
    tenant_conditions = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=15, default="draft")
    rejection_reason = models.CharField(max_length=255, null=True, blank=True)
    reviewed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                    db_column="reviewed_by", related_name="+")
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(Unmanaged.Meta):
        db_table = "listings"


class ListingImage(Unmanaged):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="images")
    file_path = models.CharField(max_length=500)
    thumb_path = models.CharField(max_length=500, null=True, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    file_hash = models.CharField(max_length=64, null=True, blank=True)

    class Meta(Unmanaged.Meta):
        db_table = "listing_images"
        ordering = ["sort_order", "id"]


class ListingAmenity(Unmanaged):  # composite PK (listing_id, amenity_id)
    listing = models.ForeignKey(Listing, primary_key=True, on_delete=models.CASCADE,
                                related_name="listing_amenities")
    amenity = models.ForeignKey(Amenity, on_delete=models.CASCADE)

    class Meta(Unmanaged.Meta):
        db_table = "listing_amenities"


class SavedSearch(Unmanaged):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_searches")
    name = models.CharField(max_length=100, null=True, blank=True)
    filters = models.JSONField()
    alert_channel = models.CharField(max_length=10, default="push")
    is_active = models.BooleanField(default=True)
    last_alerted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "saved_searches"


class Favourite(Unmanaged):  # composite PK (user_id, listing_id)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    listing = models.ForeignKey(Listing, primary_key=True, on_delete=models.CASCADE, related_name="favourites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "favourites"


class SearchLog(Unmanaged):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    channel = models.CharField(max_length=10)
    filters = models.JSONField()
    result_count = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "search_logs"


# --------------------------------------- enquiries, viewings, applications


class Enquiry(Unmanaged):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="enquiries")
    tenant = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    landlord = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    message = models.TextField()
    reply = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=10, default="open")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "enquiries"


class Viewing(Unmanaged):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="viewings")
    tenant = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    landlord = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    proposed_at = models.DateTimeField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, default="requested")
    note = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "viewings"


class Application(Unmanaged):
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="applications")
    tenant = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    landlord = models.ForeignKey(User, on_delete=models.CASCADE, related_name="+")
    message = models.TextField(null=True, blank=True)
    household_size = models.PositiveSmallIntegerField(null=True, blank=True)
    desired_move_in = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=15, default="submitted")
    accepted_at = models.DateTimeField(null=True, blank=True)
    respond_by = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(Unmanaged.Meta):
        db_table = "applications"


# --------------------------------------------- commission and placements


class CommissionRule(Unmanaged):
    name = models.CharField(max_length=100)
    fee_type = models.CharField(max_length=10)  # percentage | flat
    value = models.DecimalField(max_digits=10, decimal_places=4)
    min_fee = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    max_fee = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    landlord_share_pct = models.DecimalField(max_digits=5, decimal_places=2)
    tenant_share_pct = models.DecimalField(max_digits=5, decimal_places=2)
    scope_type = models.CharField(max_length=10, default="global")  # global | city | suburb
    scope = models.ForeignKey(Location, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    rent_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    rent_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="USD")
    priority = models.SmallIntegerField(default=0)
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   db_column="created_by", related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(Unmanaged.Meta):
        db_table = "commission_rules"


class CommissionRuleAudit(Unmanaged):
    rule = models.ForeignKey(CommissionRule, on_delete=models.CASCADE, related_name="audit")
    action = models.CharField(max_length=12)
    changed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   db_column="changed_by", related_name="+")
    old_values = models.JSONField(null=True, blank=True)
    new_values = models.JSONField(null=True, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "commission_rule_audit"


class Placement(Unmanaged):
    application = models.OneToOneField(Application, on_delete=models.PROTECT, related_name="placement")
    listing = models.ForeignKey(Listing, on_delete=models.PROTECT, related_name="placements")
    landlord = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    tenant = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    rule = models.ForeignKey(CommissionRule, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    rule_snapshot = models.JSONField()
    currency = models.CharField(max_length=3)
    first_rent = models.DecimalField(max_digits=12, decimal_places=2)
    total_fee = models.DecimalField(max_digits=12, decimal_places=2)
    landlord_fee = models.DecimalField(max_digits=12, decimal_places=2)
    tenant_fee = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, default="awaiting_payment")
    confirmed_at = models.DateTimeField()
    payment_deadline = models.DateTimeField(null=True, blank=True)
    contacts_released_at = models.DateTimeField(null=True, blank=True)
    move_in_date = models.DateField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(Unmanaged.Meta):
        db_table = "placements"


class Invoice(Unmanaged):
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="invoices")
    payer = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    payer_role = models.CharField(max_length=10)
    invoice_no = models.CharField(max_length=30, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3)
    due_date = models.DateField()
    status = models.CharField(max_length=10, default="unpaid")
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "invoices"


class Payment(Unmanaged):
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3)
    method = models.CharField(max_length=15)
    gateway = models.CharField(max_length=40, null=True, blank=True)
    gateway_reference = models.CharField(max_length=120, null=True, blank=True)
    status = models.CharField(max_length=10, default="pending")
    gateway_payload = models.JSONField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "payments"


class LedgerEntry(Unmanaged):
    """Append-only (the database blocks UPDATE/DELETE). Corrections are new rows."""
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="ledger")
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    party = models.CharField(max_length=10)
    entry_type = models.CharField(max_length=12)
    direction = models.CharField(max_length=6)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3)
    note = models.CharField(max_length=255, null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                   db_column="created_by", related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "ledger_entries"


class FeeAdjustment(Unmanaged):
    placement = models.ForeignKey(Placement, on_delete=models.PROTECT, related_name="adjustments")
    party = models.CharField(max_length=10)
    type = models.CharField(max_length=12)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)
    approved_by = models.ForeignKey(User, on_delete=models.PROTECT, db_column="approved_by", related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "fee_adjustments"


# ------------------------------------------------- notifications and logs


class Notification(Unmanaged):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notifications")
    event = models.CharField(max_length=60)
    channel = models.CharField(max_length=10)
    related_type = models.CharField(max_length=40, null=True, blank=True)
    related_id = models.BigIntegerField(null=True, blank=True)
    title = models.CharField(max_length=150, null=True, blank=True)
    body = models.TextField(null=True, blank=True)
    payload = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=10, default="queued")
    attempts = models.PositiveSmallIntegerField(default=0)
    provider_message_id = models.CharField(max_length=150, null=True, blank=True)
    error = models.CharField(max_length=255, null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "notifications"
        ordering = ["-created_at"]


class WhatsAppSession(Unmanaged):
    phone = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    state = models.CharField(max_length=60, default="start")
    context = models.JSONField(null=True, blank=True)
    last_inbound_at = models.DateTimeField(null=True, blank=True)
    window_expires_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(Unmanaged.Meta):
        db_table = "whatsapp_sessions"


class AuditLog(Unmanaged):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    action = models.CharField(max_length=80)
    entity_type = models.CharField(max_length=40)
    entity_id = models.BigIntegerField(null=True, blank=True)
    old_values = models.JSONField(null=True, blank=True)
    new_values = models.JSONField(null=True, blank=True)
    ip_address = models.CharField(max_length=45, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(Unmanaged.Meta):
        db_table = "audit_logs"
