from decimal import Decimal

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from core.models import (Amenity, Application, CommissionRule, Enquiry, Invoice, Listing, ListingAmenity,
                         Location, Notification, Placement, Property, SavedSearch, User, Viewing)
from core.services import commission

PROPERTY_TYPES = ["house", "flat", "cottage", "single_room", "shared_room", "backroom", "other"]
FURNISHING = ["furnished", "semi_furnished", "unfurnished"]


def media_url(request, path):
    if not path:
        return None
    url = settings.MEDIA_URL + path
    return request.build_absolute_uri(url) if request else url


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "role", "full_name", "phone", "email", "verification_status",
                  "whatsapp_opt_in", "status", "created_at"]
        read_only_fields = ["id", "role", "phone", "verification_status", "status", "created_at"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "parent", "name", "type", "latitude", "longitude"]


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
        return {"name": obj.landlord.full_name, "verified": obj.landlord.verification_status == "verified"}

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
    location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.filter(is_active=True))
    address_line = serializers.CharField(max_length=255)
    property_type = serializers.ChoiceField(choices=PROPERTY_TYPES)
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    title = serializers.CharField(max_length=160)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
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

    PROPERTY_FIELDS = ("location", "address_line", "property_type", "latitude", "longitude")

    def _set_amenities(self, listing, slugs):
        ListingAmenity.objects.filter(listing=listing).delete()
        found = Amenity.objects.filter(slug__in=slugs, is_active=True)
        ListingAmenity.objects.bulk_create([ListingAmenity(listing=listing, amenity=a) for a in found])

    @transaction.atomic
    def create(self, validated):
        landlord = self.context["request"].user
        slugs = validated.pop("amenities", [])
        prop = Property.objects.create(
            landlord=landlord, location=validated["location"], address_line=validated["address_line"],
            property_type=validated["property_type"], latitude=validated.get("latitude"),
            longitude=validated.get("longitude"), description=validated.get("description"))
        listing = Listing.objects.create(
            property=prop, landlord=landlord, location=validated["location"],
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

    class Meta(ListingPublicSerializer.Meta):
        fields = ListingPublicSerializer.Meta.fields + ["address_line", "rejection_reason", "application_count"]

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
    fee_estimate = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = ["id", "status", "message", "household_size", "desired_move_in", "accepted_at", "respond_by",
                  "created_at", "listing", "tenant", "placement_id", "fee_estimate"]

    def get_listing(self, obj):
        return {"id": obj.listing_id, "title": obj.listing.title, "rent": str(obj.listing.rent),
                "currency": obj.listing.currency, "status": obj.listing.status}

    def get_tenant(self, obj):
        t = obj.tenant
        return {"id": t.id, "name": t.full_name, "verified": t.verification_status == "verified"}

    def get_placement_id(self, obj):
        p = getattr(obj, "placement", None)
        return p.id if p else None

    def get_fee_estimate(self, obj):
        if obj.status != "accepted":
            return None
        return commission.estimate_for_listing(obj.listing)


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = ["id", "placement", "payer_role", "invoice_no", "amount", "currency", "due_date", "status", "paid_at"]


class PlacementSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()
    invoices = InvoiceSerializer(many=True, read_only=True)
    contacts = serializers.SerializerMethodField()

    class Meta:
        model = Placement
        fields = ["id", "status", "currency", "first_rent", "total_fee", "landlord_fee", "tenant_fee",
                  "rule_snapshot", "confirmed_at", "payment_deadline", "contacts_released_at", "move_in_date",
                  "cancel_reason", "listing", "invoices", "contacts"]

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
