"""The owner's scans-and-reports collection endpoint.

`GET /owner/pets/<id>/diagnoses` answered 405: the view was registered POST-only,
so the one method anyone would try first was rejected. Owners could still see
their reports, but only because `owner_pet_detail_view` embeds them in the pet
payload -- the collection could not be fetched on its own.

Also pins the permission shape around it, which is easy to get wrong in either
direction: an owner may add a scan (one taken at another clinic is exactly the
case this route exists for) but must not be able to delete a clinical record
about their own animal, and must not see anyone else's.

Traceability: CLAUDE.md rule 4; docs/API_CONTRACT.md §4.3.
"""

from appointments.models import DiagnosticReport

from .base import API, ApiTestCase, upload


class OwnerPetDiagnosesTests(ApiTestCase):

    def setUp(self):
        super().setUp()
        self.report = DiagnosticReport.objects.create(
            pet=self.pet_a, report_type="XRAY", notes="Left stifle, mild changes.",
        )

    def url(self, pet):
        return f"{API}/owner/pets/{pet.id}/diagnoses"

    def test_get_returns_the_pets_reports(self):
        res = self.auth(self.owner_a).get(self.url(self.pet_a))
        self.assertEqual(res.status_code, 200, f"GET must not 405; got {res.status_code}")
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["report_type"], "XRAY")

    def test_get_is_scoped_to_the_requesting_owner(self):
        """Someone else's pet is a 404, not a listing and not a 403."""
        res = self.auth(self.owner_b).get(self.url(self.pet_a))
        self.assertEqual(res.status_code, 404)

    def test_an_owner_may_still_add_a_scan(self):
        res = self.auth(self.owner_a).post(
            self.url(self.pet_a),
            {
                "report_type": "MRI",
                "notes": "From another clinic.",
                "file": upload("outside_clinic_mri.png"),
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(self.pet_a.diagnostic_reports.count(), 2)

    def test_an_owner_cannot_delete_a_clinical_record(self):
        res = self.auth(self.owner_a).delete(f"{API}/diagnoses/{self.report.id}")
        self.assertIn(res.status_code, (403, 404, 405))
        self.assertTrue(
            DiagnosticReport.objects.filter(pk=self.report.pk).exists(),
            "an owner must not be able to remove a record about their own animal",
        )

    def test_the_doctor_still_sees_the_same_reports(self):
        res = self.auth(self.doctor).get(f"{API}/pets/{self.pet_a.id}/diagnoses")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
