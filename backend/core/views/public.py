from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.models import Amenity, Application, Listing, Location, SearchLog
from core.search import apply_listing_filters
from core.serializers import (AmenitySerializer, ListingDetailSerializer, ListingPublicSerializer,
                              LocationSerializer)


def listing_queryset():
    return (Listing.objects.select_related("location__parent", "landlord")
            .prefetch_related("images", "listing_amenities__amenity", "landlord__verification_docs"))


class ListingPagination(PageNumberPagination):
    page_size = 12
    page_size_query_param = "page_size"
    max_page_size = 50


class ListingSearchView(ListAPIView):
    """GET /api/listings/?location=&min_rent=&max_rent=&bedrooms=&type=&furnishing=
    &amenities=borehole,parking&available_by=&verified=1&q=&lat=&lng=&radius_km=&sort="""
    permission_classes = [AllowAny]
    serializer_class = ListingPublicSerializer
    pagination_class = ListingPagination
    throttle_scope = "search"

    def get_queryset(self):
        return apply_listing_filters(listing_queryset().filter(status="published"), self.request.query_params)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # Record what people search for, especially searches with zero results (unmet demand).
        channel = request.headers.get("X-Channel", "web")
        SearchLog.objects.create(
            user=request.user if request.user.is_authenticated else None,
            channel=channel if channel in ("web", "android", "whatsapp") else "web",
            filters=request.query_params.dict(), result_count=response.data.get("count", 0))
        return response


class ListingDetailView(RetrieveAPIView):
    permission_classes = [AllowAny]
    serializer_class = ListingDetailSerializer

    def get_queryset(self):
        qs = listing_queryset()
        u = self.request.user
        if u.is_authenticated and u.role == "admin":
            return qs
        visible = Q(status="published")
        if u.is_authenticated:
            visible |= Q(landlord=u)
            if u.role == "tenant":
                visible |= Q(applications__tenant=u)
        return qs.filter(visible).distinct()


@api_view(["GET"])
@permission_classes([AllowAny])
def locations(request):
    qs = Location.objects.filter(is_active=True)
    if t := request.query_params.get("type"):
        qs = qs.filter(type=t)
    if p := request.query_params.get("parent"):
        qs = qs.filter(parent_id=p)
    return Response(LocationSerializer(qs.order_by("name"), many=True).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def amenities(request):
    return Response(AmenitySerializer(Amenity.objects.filter(is_active=True).order_by("category", "name"), many=True).data)
