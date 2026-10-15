"""Django admin: create and manage accounts (tenants, landlords, admins) and reference data.

Open http://127.0.0.1:8000/admin/ and log in with an ADMIN account (phone number + password).
Accounts created here can log in to the React app with the same phone number and password
(use the "Have a password?" link on the login page), or with an SMS code.
"""
from django import forms
from django.contrib import admin
from django.utils import timezone

from core import models as m
from core.exceptions import WorkflowError
from core.services.otp import normalize_phone

admin.site.site_header = "Rental Platform admin"
admin.site.site_title = "Rental Platform"
admin.site.index_title = "Accounts and data"


class UserAdminForm(forms.ModelForm):
    password1 = forms.CharField(
        label="Password", required=False, widget=forms.PasswordInput(render_value=False),
        help_text="Required when adding a user (everyone logs in with a password). "
                  "Leave blank when editing to keep the current password.")
    password2 = forms.CharField(label="Confirm password", required=False, widget=forms.PasswordInput(render_value=False))

    class Meta:
        model = m.User
        fields = ["phone", "full_name", "email", "role", "verification_status", "status", "whatsapp_opt_in"]

    def clean_phone(self):
        try:
            return normalize_phone(self.cleaned_data["phone"])
        except WorkflowError as exc:
            raise forms.ValidationError(str(exc))

    def clean_role(self):
        role = self.cleaned_data["role"]
        if role not in ("tenant", "landlord", "admin"):
            raise forms.ValidationError("Role must be tenant, landlord or admin.")
        return role

    def clean(self):
        data = super().clean()
        p1, p2 = data.get("password1"), data.get("password2")
        if p1 or p2:
            if p1 != p2:
                self.add_error("password2", "The two passwords do not match.")
            elif len(p1) < 8:
                self.add_error("password1", "Use at least 8 characters.")
        elif not self.instance.pk:
            self.add_error("password1", "Set a password. Everyone logs in with a password now.")
        if not self.instance.pk and data.get("role") != "admin" and not data.get("email"):
            self.add_error("email", "Add an email address, so this person can log in with it and reset their password.")
        return data


@admin.register(m.User)
class UserAdmin(admin.ModelAdmin):
    form = UserAdminForm
    list_display = ("id", "full_name", "phone", "role", "verification_status", "status", "created_at")
    list_filter = ("role", "verification_status", "status")
    search_fields = ("full_name", "phone", "email")
    ordering = ("-id",)
    readonly_fields = ("created_at", "last_login")
    actions = ["mark_verified", "suspend_users", "reinstate_users"]
    fieldsets = (
        ("Account", {"fields": ("phone", "full_name", "email", "role")}),
        ("Password", {"fields": ("password1", "password2")}),
        ("Status", {"fields": ("verification_status", "status", "whatsapp_opt_in")}),
        ("Activity", {"fields": ("created_at", "last_login")}),
    )

    def save_model(self, request, obj, form, change):
        password = form.cleaned_data.get("password1")
        if password:
            obj.set_password(password)
        if not change and not obj.phone_verified_at:
            obj.phone_verified_at = timezone.now()
        super().save_model(request, obj, form, change)

    def has_delete_permission(self, request, obj=None):
        return False  # accounts own listings and money records; suspend instead of deleting

    @admin.action(description="Mark selected users as verified")
    def mark_verified(self, request, queryset):
        self.message_user(request, f"{queryset.update(verification_status='verified')} user(s) verified.")

    @admin.action(description="Suspend selected users")
    def suspend_users(self, request, queryset):
        n = queryset.exclude(pk=request.user.pk).update(status="suspended")
        self.message_user(request, f"{n} user(s) suspended.")

    @admin.action(description="Reinstate selected users")
    def reinstate_users(self, request, queryset):
        self.message_user(request, f"{queryset.update(status='active')} user(s) reinstated.")


@admin.register(m.Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "type", "parent", "is_active")
    list_filter = ("type", "is_active")
    search_fields = ("name",)
    ordering = ("type", "name")


@admin.register(m.Amenity)
class AmenityAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "slug", "category", "is_active")
    list_filter = ("category", "is_active")


class ReadOnlyAdmin(admin.ModelAdmin):
    """Browse-only. Changes to these records go through the app so the business rules,
    notifications and the money ledger stay consistent."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(m.Listing)
class ListingAdmin(ReadOnlyAdmin):
    list_display = ("id", "title", "landlord_id", "rent", "currency", "status", "created_at")
    list_filter = ("status", "property_type")
    search_fields = ("title",)


@admin.register(m.Application)
class ApplicationAdmin(ReadOnlyAdmin):
    list_display = ("id", "listing_id", "tenant_id", "landlord_id", "status", "created_at")
    list_filter = ("status",)


@admin.register(m.Placement)
class PlacementAdmin(ReadOnlyAdmin):
    list_display = ("id", "listing_id", "first_rent", "total_fee", "landlord_fee", "tenant_fee", "status", "confirmed_at")
    list_filter = ("status",)


@admin.register(m.Invoice)
class InvoiceAdmin(ReadOnlyAdmin):
    list_display = ("invoice_no", "payer_role", "amount", "currency", "status", "due_date")
    list_filter = ("status", "payer_role")
    search_fields = ("invoice_no",)


@admin.register(m.Payment)
class PaymentAdmin(ReadOnlyAdmin):
    list_display = ("id", "invoice_id", "amount", "method", "status", "gateway_reference", "paid_at")
    list_filter = ("status", "method")


@admin.register(m.LedgerEntry)
class LedgerEntryAdmin(ReadOnlyAdmin):
    list_display = ("id", "placement_id", "party", "entry_type", "direction", "amount", "currency", "created_at")
    list_filter = ("entry_type", "party")


@admin.register(m.Notification)
class NotificationAdmin(ReadOnlyAdmin):
    list_display = ("id", "user_id", "event", "channel", "status", "created_at")
    list_filter = ("channel", "status")


@admin.register(m.VerificationDoc)
class VerificationDocAdmin(ReadOnlyAdmin):
    list_display = ("id", "user_id", "doc_type", "status", "reviewed_by_id", "created_at", "reviewed_at")
    list_filter = ("status", "doc_type")
