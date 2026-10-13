from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from core.views import admin as adm
from core.views import auth, billing, landlord, public, tenant, webhooks

router = DefaultRouter(trailing_slash=True)
router.register("me/saved-searches", tenant.SavedSearchViewSet, basename="saved-search")
router.register("admin/commission-rules", adm.CommissionRuleViewSet, basename="commission-rule")

urlpatterns = [
    # --- auth & profile
    path("auth/otp/request/", auth.OtpRequestView.as_view()),
    path("auth/otp/verify/", auth.OtpVerifyView.as_view()),
    path("auth/login/", auth.PasswordLoginView.as_view()),
    path("auth/token/refresh/", TokenRefreshView.as_view()),
    path("me/", auth.MeView.as_view()),
    path("me/devices/", auth.device_token),
    path("me/verification-docs/", auth.verification_docs),
    path("me/notifications/", tenant.my_notifications),
    path("me/notifications/read-all/", tenant.mark_all_notifications_read),
    path("me/notifications/<int:pk>/read/", tenant.mark_notification_read),

    # --- public search
    path("locations/", public.locations),
    path("amenities/", public.amenities),
    path("listings/", public.ListingSearchView.as_view()),
    path("listings/<int:pk>/", public.ListingDetailView.as_view()),

    # --- tenant
    path("listings/<int:pk>/apply/", tenant.apply_for_listing),
    path("listings/<int:pk>/enquiries/", tenant.create_enquiry),
    path("listings/<int:pk>/viewings/", tenant.create_viewing),
    path("listings/<int:pk>/favourite/", tenant.favourite),
    path("me/applications/", tenant.my_applications),
    path("me/enquiries/", tenant.my_enquiries),
    path("me/viewings/", tenant.my_viewings),
    path("me/favourites/", tenant.my_favourites),
    path("applications/<int:pk>/withdraw/", tenant.withdraw_application),
    path("applications/<int:pk>/confirm/", tenant.confirm_acceptance),
    path("applications/<int:pk>/decline/", tenant.decline_acceptance),

    # --- landlord
    path("landlord/listings/", landlord.LandlordListings.as_view()),
    path("landlord/listings/<int:pk>/", landlord.LandlordListingDetail.as_view()),
    path("landlord/listings/<int:pk>/submit/", landlord.submit_listing),
    path("landlord/listings/<int:pk>/archive/", landlord.archive_listing),
    path("landlord/listings/<int:pk>/images/", landlord.upload_images),
    path("landlord/listings/<int:pk>/images/<int:image_id>/", landlord.delete_image),
    path("landlord/applications/", landlord.applications),
    path("landlord/applications/<int:pk>/accept/", landlord.accept_application),
    path("landlord/applications/<int:pk>/reject/", landlord.reject_application),
    path("landlord/enquiries/", landlord.enquiries),
    path("landlord/enquiries/<int:pk>/reply/", landlord.reply_enquiry),
    path("landlord/viewings/", landlord.viewings),
    path("landlord/viewings/<int:pk>/update/", landlord.update_viewing),

    # --- placements & billing (tenant and landlord)
    path("placements/", billing.placements),
    path("placements/<int:pk>/", billing.placement_detail),
    path("invoices/", billing.invoices),
    path("invoices/<int:pk>/pay/", billing.pay_invoice),

    # --- admin
    path("admin/stats/", adm.stats),
    path("admin/alerts/", adm.alerts),
    path("admin/alerts/listing-review/read/", adm.mark_listing_alerts_read),
    path("admin/users/", adm.users),
    path("admin/users/<int:pk>/verification/", adm.set_user_verification),
    path("admin/users/<int:pk>/status/", adm.set_user_status),
    path("admin/verification-docs/", adm.verification_docs),
    path("admin/verification-docs/<int:pk>/file/", adm.verification_doc_file),
    path("admin/verification-docs/<int:pk>/review/", adm.review_doc),
    path("admin/commission-rules/<int:pk>/audit/", adm.rule_audit),
    path("admin/listings/", adm.listings_for_review),
    path("admin/listings/<int:pk>/review/", adm.review_listing),
    path("admin/placements/", adm.placements),
    path("admin/placements/<int:pk>/cancel/", adm.cancel_placement),
    path("admin/invoices/<int:pk>/record-payment/", adm.record_payment),
    path("admin/invoices/<int:pk>/waive/", adm.waive_invoice),

    # --- webhooks
    path("webhooks/whatsapp/", webhooks.whatsapp_webhook),
    path("webhooks/payments/", webhooks.payment_webhook),

    path("", include(router.urls)),
]
