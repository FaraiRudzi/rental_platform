from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, override_settings

from core.exceptions import SmsDeliveryError
from core.services.sms import send_sms


@override_settings(RENTAL={
    "SMS": {
        "DRIVER": "twilio",
        "TWILIO_ACCOUNT_SID": "AC123",
        "TWILIO_AUTH_TOKEN": "test-token",
        "TWILIO_FROM": "+15005550006",
    },
})
class TwilioSmsTests(SimpleTestCase):
    @patch("core.services.sms.requests.post")
    def test_sends_message_using_twilio_form_and_basic_auth(self, post):
        post.return_value = Mock(status_code=201)

        result = send_sms("+263771234567", "Your code is 123456.")

        self.assertEqual(result, "sent")
        post.assert_called_once_with(
            "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
            data={
                "To": "+263771234567",
                "From": "+15005550006",
                "Body": "Your code is 123456.",
            },
            auth=("AC123", "test-token"),
            timeout=15,
        )

    @patch("core.services.sms.requests.post")
    def test_reports_missing_twilio_credentials_without_sending(self, post):
        with override_settings(RENTAL={"SMS": {
            "DRIVER": "twilio",
            "TWILIO_ACCOUNT_SID": "",
            "TWILIO_AUTH_TOKEN": "",
            "TWILIO_FROM": "",
        }}):
            with self.assertRaisesMessage(SmsDeliveryError, "Twilio SMS is not fully configured"):
                send_sms("+263771234567", "Your code is 123456.")

        post.assert_not_called()

    @patch("core.services.sms.requests.post")
    def test_reports_provider_rejection_without_exposing_provider_response(self, post):
        response = Mock()
        response.raise_for_status.side_effect = requests.HTTPError("provider rejected request")
        post.return_value = response

        with self.assertRaisesMessage(SmsDeliveryError, "Twilio could not deliver your code"):
            send_sms("+263771234567", "Your code is 123456.")
