import json
from urllib.parse import urlsplit
from datetime import date, timedelta
from unittest import skipUnless
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core import mail
from django.db import DatabaseError, connection, transaction
from django.test import TestCase
from django.test.utils import override_settings
from django.utils import timezone
from openpyxl import Workbook
from io import BytesIO

from .models import (
    AcademicPeriod, AcademicPlan, Attendance, Book, Enrollment, Grade, GradingScale,
    Loan, LoginThrottle, Membership, Notice, NoticeRead, Offering, PlanYear, PlatformBillingSettings,
    PlatformPriceChange, School, SchoolEvent, SchoolSubscription, Section,
    Student, StudentGuardian, Subject, SubscriptionCharge, SubscriptionPlan, TeacherAssignment, User,
    SchoolSignupRequest,
)


class SchoolApiTestCase(TestCase):
    def setUp(self):
        self.school_a = School.objects.create(name="Secundaria Río", slug="secundaria-rio", school_type=School.Type.COMMON)
        self.school_b = School.objects.create(name="Técnica Sur", slug="tecnica-sur", school_type=School.Type.TECHNICAL)
        self.admin = self.user("directivo@rio.test", "Directiva")
        self.member(self.admin, self.school_a, Membership.Role.DIRECTOR)
        self.member(self.admin, self.school_b, Membership.Role.DIRECTOR)
        self.teacher = self.user("docente@rio.test", "Docente")
        self.teacher_membership = self.member(self.teacher, self.school_a, Membership.Role.TEACHER)
        self.section_a = self.section(self.school_a, "1° año", 1)
        self.section_b = self.section(self.school_b, "1° año", 1)
        self.student_a = self.student(self.school_a, self.section_a, "Alumna de Río", "RIO-1")
        self.student_b = self.student(self.school_b, self.section_b, "Alumno de Técnica", "TEC-1")
        self.math_a = Subject.objects.create(school=self.school_a, name="Matemática")
        self.math_b = Subject.objects.create(school=self.school_b, name="Programación", kind=Subject.Kind.WORKSHOP)
        self.offering_a = Offering.objects.create(school=self.school_a, section=self.section_a, subject=self.math_a)
        self.offering_b = Offering.objects.create(school=self.school_b, section=self.section_b, subject=self.math_b)
        GradingScale.objects.create(school=self.school_a)
        GradingScale.objects.create(school=self.school_b)

    def user(self, email, name):
        return User.objects.create_user(email=email, password="test-password-2026", name=name)

    def member(self, user, school, role):
        return Membership.objects.create(user=user, school=school, role=role)

    def section(self, school, label, ordinal):
        plan = AcademicPlan.objects.create(school=school, name=f"Plan {school.slug}", school_type=school.school_type,
                                           jurisdiction="A definir", valid_from_year=timezone.localdate().year)
        year = PlanYear.objects.create(school=school, plan=plan, year_label=label, ordinal=ordinal,
                                       orientation="Informática" if school.school_type == School.Type.TECHNICAL else "")
        return Section.objects.create(school=school, plan_year=year, academic_year=timezone.localdate().year,
                                      division="A", shift=Section.Shift.MORNING)

    def student(self, school, section, name, source_id):
        student = Student.objects.create(school=school, name=name, source_id=source_id)
        Enrollment.objects.create(school=school, student=student, section=section, academic_year=section.academic_year)
        return student

    def sign_in(self, user, school):
        self.client.force_login(user)
        session = self.client.session
        session["active_school_id"] = school.pk
        session.save()

    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def test_school_scope_comes_from_membership_and_rejects_foreign_ids(self):
        self.sign_in(self.admin, self.school_a)
        response = self.client.get("/api/v1/students/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.json()], [self.student_a.id])
        response = self.post_json("/api/v1/attendance/", {
            "student_id": self.student_b.id, "date": date.today().isoformat(), "status": "Ausente",
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Attendance.objects.filter(student=self.student_b).exists())
        response = self.post_json("/api/v1/students/", {
            "name": "Intento de cruce", "section_id": self.section_b.id,
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Student.objects.filter(school=self.school_a, name="Intento de cruce").exists())

    def test_first_student_can_create_the_school_first_section(self):
        school = School.objects.create(name="Secundaria Nueva", slug="secundaria-nueva", school_type=School.Type.COMMON)
        self.member(self.admin, school, Membership.Role.DIRECTOR)
        self.sign_in(self.admin, school)

        response = self.post_json("/api/v1/students/", {
            "name": "Alumna nueva", "course": "1° año", "division": "A", "shift": "morning",
        })

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(Student.objects.filter(school=school, name="Alumna nueva").exists())
        section = Section.objects.get(school=school)
        self.assertEqual(section.plan_year.year_label, "1° año")
        self.assertTrue(Enrollment.objects.filter(school=school, section=section, student__name="Alumna nueva").exists())

    def test_user_can_switch_only_between_member_schools(self):
        self.sign_in(self.admin, self.school_a)
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual({s["id"] for s in response.json()["schools"]}, {self.school_a.id, self.school_b.id})
        response = self.post_json("/api/v1/schools/", {"school_id": self.school_b.id})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/me/").json()["school_id"], self.school_b.id)
        self.assertEqual([row["id"] for row in self.client.get("/api/v1/students/").json()], [self.student_b.id])
        outsider = self.user("outsider@test.edu", "Sin vínculo")
        self.member(outsider, self.school_a, Membership.Role.STUDENT)
        self.client.force_login(outsider)
        response = self.post_json("/api/v1/schools/", {"school_id": self.school_b.id})
        self.assertEqual(response.status_code, 403)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_existing_user_can_join_another_school_with_an_independent_role(self):
        worker = self.user("multi-school@staff.test", "Personal compartido")
        worker.set_password("existing-worker-password")
        worker.save(update_fields=("password",))
        membership_a = self.member(worker, self.school_a, Membership.Role.TEACHER)
        self.sign_in(self.admin, self.school_b)

        response = self.post_json("/api/v1/settings/", {
            "kind": "user", "name": worker.name, "email": worker.email, "role": Membership.Role.SECRETARY,
        })

        self.assertEqual(response.status_code, 201, response.content)
        membership_b = Membership.objects.get(school=self.school_b, user=worker)
        self.assertEqual(membership_a.role, Membership.Role.TEACHER)
        self.assertEqual(membership_b.role, Membership.Role.SECRETARY)
        self.assertEqual(membership_a.user_id, membership_b.user_id)
        login_response = self.post_json("/api/v1/auth/login/", {
            "email": worker.email, "password": "existing-worker-password",
        })
        self.assertEqual(login_response.status_code, 200)

        me = self.client.get("/api/v1/me/").json()
        self.assertEqual(me["role"], Membership.Role.TEACHER)
        self.assertEqual({(school["id"], school["role"]) for school in me["schools"]}, {
            (self.school_a.id, Membership.Role.TEACHER),
            (self.school_b.id, Membership.Role.SECRETARY),
        })
        self.assertEqual(self.post_json("/api/v1/schools/", {"school_id": self.school_b.id}).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/me/").json()["role"], Membership.Role.SECRETARY)
        self.assertEqual([row["id"] for row in self.client.get("/api/v1/students/").json()], [self.student_b.id])

    def test_email_login_uses_memberships_to_build_school_selector(self):
        response = self.post_json("/api/v1/auth/login/", {
            "email": "DIRECTIVO@RIO.TEST", "password": "test-password-2026",
        })
        self.assertEqual(response.status_code, 200)
        me = self.client.get("/api/v1/me/")
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["role"], Membership.Role.DIRECTOR)
        self.assertEqual(len(me.json()["schools"]), 2)

    def test_health_endpoint_reports_build_identifier(self):
        with patch.dict("os.environ", {"NEXO_RELEASE": "test-build-42"}):
            response = self.client.get("/healthz/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["release"], "test-build-42")

    def test_login_rate_limit_blocks_repeated_failures(self):
        payload = {"email": "directivo@rio.test", "password": "wrong-password"}
        for _ in range(10):
            response = self.post_json("/api/v1/auth/login/", payload)
            self.assertEqual(response.status_code, 401)

        blocked = self.post_json("/api/v1/auth/login/", {
            "email": "DIRECTIVO@RIO.TEST", "password": "test-password-2026",
        })
        self.assertEqual(blocked.status_code, 429)
        self.assertGreater(int(blocked["Retry-After"]), 0)
        self.assertEqual(LoginThrottle.objects.count(), 3)
        self.assertNotIn("directivo@rio.test", " ".join(
            LoginThrottle.objects.values_list("key_digest", flat=True)
        ))

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_password_reset_does_not_disclose_unknown_addresses(self):
        known = self.client.post("/accounts/password_reset/", {"email": self.admin.email})
        self.assertEqual(known.status_code, 302)
        self.assertEqual(len(mail.outbox), 1)

        mail.outbox.clear()
        unknown = self.client.post("/accounts/password_reset/", {"email": "unknown@rio.test"})
        self.assertEqual(unknown.status_code, 302)
        self.assertEqual(unknown.url, known.url)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_password_recovery_sends_a_reset_link(self):
        response = self.client.post("/accounts/password_reset/", {"email": self.admin.email})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/accounts/reset/", mail.outbox[0].body)

    def test_guardian_only_sees_linked_students_and_their_grades(self):
        guardian = self.user("familia@rio.test", "Familia")
        self.member(guardian, self.school_a, Membership.Role.GUARDIAN)
        StudentGuardian.objects.create(school=self.school_a, student=self.student_a, guardian=guardian)
        period = AcademicPeriod.objects.create(school=self.school_a, name="Trimestre 1", year=date.today().year)
        Grade.objects.create(school=self.school_a, student=self.student_a, offering=self.offering_a, period=period, value=8)
        self.sign_in(guardian, self.school_a)
        self.assertEqual([row["id"] for row in self.client.get("/api/v1/students/").json()], [self.student_a.id])
        self.assertEqual(len(self.client.get("/api/v1/grades/").json()), 1)
        self.assertEqual(self.client.get("/api/v1/attendance/").status_code, 200)

    def test_student_can_keep_enrollments_across_school_years(self):
        self.sign_in(self.admin, self.school_a)
        previous_section = Section.objects.create(school=self.school_a, plan_year=self.section_a.plan_year,
            academic_year=self.section_a.academic_year-1, division="A", shift=Section.Shift.MORNING)
        previous = Enrollment.objects.create(school=self.school_a, student=self.student_a, section=previous_section,
            academic_year=previous_section.academic_year)
        next_section = Section.objects.create(school=self.school_a, plan_year=self.section_a.plan_year,
            academic_year=self.section_a.academic_year+1, division="A", shift=Section.Shift.MORNING)
        response = self.post_json("/api/v1/enrollments/", {
            "student_id": self.student_a.id, "section_id": next_section.id,
            "academic_year": next_section.academic_year,
        })
        self.assertEqual(response.status_code, 201)
        previous.refresh_from_db()
        self.assertEqual(previous.state, Enrollment.State.PROMOTED)
        self.assertEqual(Enrollment.objects.filter(school=self.school_a, student=self.student_a).count(), 3)
        response = self.post_json("/api/v1/enrollments/", {
            "student_id": self.student_a.id, "section_id": self.section_b.id,
            "academic_year": self.section_b.academic_year,
        })
        self.assertEqual(response.status_code, 400)

    def test_teacher_can_record_only_assigned_workshop_attendance(self):
        self.sign_in(self.teacher, self.school_a)
        response = self.post_json("/api/v1/attendance/", {
            "student_id": self.student_a.id, "date": date.today().isoformat(), "status": "Presente",
        })
        self.assertEqual(response.status_code, 400)
        response = self.post_json("/api/v1/attendance/", {
            "student_id": self.student_a.id, "date": date.today().isoformat(), "status": "Presente",
            "offering_id": self.offering_a.id,
        })
        self.assertEqual(response.status_code, 403)
        TeacherAssignment.objects.create(school=self.school_a, offering=self.offering_a, membership=self.teacher_membership)
        response = self.post_json("/api/v1/attendance/", {
            "student_id": self.student_a.id, "date": date.today().isoformat(), "status": "Presente",
            "offering_id": self.offering_a.id,
        })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["offering"], "Matemática")
        self.assertEqual(self.client.get("/api/v1/offerings/").json()[0]["id"], self.offering_a.id)
        daily = timezone.localdate() - timedelta(days=1)
        response = self.post_json("/api/v1/attendance/", {"records": [
            {"student_id": self.student_a.id, "date": daily.isoformat(), "status": "Ausente", "offering_id": self.offering_a.id},
            {"student_id": self.student_b.id, "date": daily.isoformat(), "status": "Presente", "offering_id": self.offering_a.id},
        ]})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Attendance.objects.filter(student=self.student_a, date=daily).exists())
        second_student = self.student(self.school_a, self.section_a, "Otro alumno", "RIO-2")
        response = self.post_json("/api/v1/attendance/", {"records": [
            {"student_id": self.student_a.id, "date": daily.isoformat(), "status": "Ausente", "offering_id": self.offering_a.id},
            {"student_id": second_student.id, "date": daily.isoformat(), "status": "Presente", "offering_id": self.offering_a.id},
        ]})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(response.json()["records"]), 2)

    def test_technical_curriculum_can_be_configured_without_cross_school_references(self):
        self.sign_in(self.admin, self.school_b)
        response = self.post_json("/api/v1/academic-plans/", {
            "name": "Técnica en Programación", "school_type": "technical", "jurisdiction": "A definir",
            "orientation": "Informática", "valid_from_year": date.today().year,
        })
        self.assertEqual(response.status_code, 201)
        plan_id = response.json()["id"]
        response = self.post_json("/api/v1/plan-years/", {
            "plan_id": plan_id, "year_label": "4° año", "ordinal": 4, "orientation": "Informática",
            "subjects": [{"subject_id": self.math_b.id, "weekly_hours": 6}],
        })
        self.assertEqual(response.status_code, 201)
        year_id = response.json()["id"]
        response = self.post_json("/api/v1/plan-years/", {
            "plan_id": plan_id, "year_label": "5° año", "ordinal": 5,
            "subjects": [{"subject_id": self.math_a.id, "weekly_hours": 4}],
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(PlanYear.objects.filter(plan_id=plan_id, ordinal=5).exists())
        response = self.post_json("/api/v1/sections/", {
            "plan_year_id": year_id, "division": "B", "shift": "afternoon", "academic_year": date.today().year,
        })
        self.assertEqual(response.status_code, 201)

    def test_import_preview_reports_errors_then_commits_only_valid_rows(self):
        self.sign_in(self.admin, self.school_a)
        content = ("source_id,name,email,course,division,shift,orientation\n"
                   "IMP-1,Estudiante Importada,importada@rio.test,1° año,A,morning,\n"
                   "IMP-2,,mal-correo,1° año,A,morning,\n"
                   "IMP-1,Duplicada,otra@rio.test,1° año,A,morning,\n")
        upload = SimpleUploadedFile("alumnos.csv", content.encode("utf-8"), content_type="text/csv")
        response = self.client.post("/api/v1/imports/preview/", {"resource": "students", "file": upload})
        self.assertEqual(response.status_code, 201)
        preview = response.json()
        self.assertEqual(preview["rows"], 3)
        self.assertEqual(preview["valid_rows"], 1)
        self.assertEqual([item["row"] for item in preview["errors"]], [3, 4])
        response = self.post_json(f"/api/v1/imports/{preview['batch_id']}/commit/", {})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["created"], 1)
        self.assertTrue(Student.objects.filter(school=self.school_a, source_id="IMP-1").exists())
        self.assertFalse(Student.objects.filter(school=self.school_a, source_id="IMP-2").exists())
        self.assertFalse(Student.objects.filter(school=self.school_a, name="Duplicada").exists())

    def test_xlsx_preview_and_loan_return_are_recorded(self):
        self.sign_in(self.admin, self.school_a)
        template = self.client.get("/api/v1/imports/templates/?resource=students&format=xlsx")
        self.assertEqual(template.status_code, 200)
        self.assertIn("spreadsheetml", template["Content-Type"])
        workbook = Workbook()
        workbook.active.append(["source_id", "name", "email", "course", "division"])
        workbook.active.append(["XLS-1", "Planilla Excel", "excel@rio.test", "1° año", "A"])
        binary = BytesIO()
        workbook.save(binary)
        upload = SimpleUploadedFile("alumnos.xlsx", binary.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        preview = self.client.post("/api/v1/imports/preview/", {"resource": "students", "file": upload}).json()
        self.assertEqual(preview["valid_rows"], 1)
        self.post_json(f"/api/v1/imports/{preview['batch_id']}/commit/", {})
        book_response = self.post_json("/api/v1/books/", {"title": "Atlas", "author": "Equipo", "code": "AT-1", "copies": 1})
        self.assertEqual(book_response.status_code, 201)
        student = Student.objects.get(school=self.school_a, source_id="RIO-1")
        loan_response = self.post_json("/api/v1/loans/", {
            "book_id": book_response.json()["id"], "student_id": student.id,
            "due_at": (timezone.localdate()+timedelta(days=10)).isoformat(),
        })
        self.assertEqual(loan_response.status_code, 201)
        returned = self.client.put(f"/api/v1/loans/{loan_response.json()['id']}/", data="{}", content_type="application/json")
        self.assertEqual(returned.status_code, 200)
        loan = Loan.objects.get(pk=loan_response.json()["id"])
        self.assertIsNotNone(loan.returned_at)
        self.assertEqual(loan.recorded_by, self.admin)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_platform_admin_creates_school_and_sends_activation(self):
        platform = User.objects.create_superuser(email="platform@demo.test", password="platform-password", name="Plataforma")
        PlatformBillingSettings.objects.create(pk=1, basic_monthly_amount_ars="125000.00", pro_monthly_amount_ars="200000.00", onboarding_amount_ars="80000.00")
        self.client.force_login(platform)
        response = self.client.get("/api/v1/me/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["school_id"])
        response = self.post_json("/api/v1/platform/schools/", {
            "name": "Nueva Escuela", "slug": "nueva-escuela", "school_type": "technical",
            "jurisdiction": "A definir", "admin_name": "Administradora", "admin_email": "admin@nueva.test",
        })
        self.assertEqual(response.status_code, 201)
        school = School.objects.get(slug="nueva-escuela")
        self.assertEqual(school.state, School.State.ONBOARDING)
        self.assertFalse(Membership.objects.filter(school=school, user__email="admin@nueva.test").exists())
        self.assertTrue(GradingScale.objects.filter(school=school).exists())
        self.assertEqual(school.subscription.charges.count(), 2)
        self.assertEqual(len(mail.outbox), 0)
        response = self.client.patch(f"/api/v1/schools/{school.id}/state/", data=json.dumps({"state": "active"}), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        setup_charge = school.subscription.charges.get(kind=SubscriptionCharge.Kind.ONBOARDING)
        first_month = school.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY)
        for charge in (setup_charge, first_month):
            response = self.client.patch(f"/api/v1/platform/billing/charges/{charge.id}/", data=json.dumps({
                "state": "paid", "transfer_reference": f"TR-{charge.id}", "invoice_number": f"0001-{charge.id}",
            }), content_type="application/json")
            self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["school_activated"])
        school.refresh_from_db()
        self.assertEqual(school.state, School.State.ACTIVE)
        self.assertEqual(school.subscription.state, SchoolSubscription.State.ACTIVE)
        self.assertTrue(Membership.objects.filter(school=school, user__email="admin@nueva.test", role=Membership.Role.SCHOOL_ADMIN).exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("activar tu cuenta", mail.outbox[0].body.lower())

    def test_platform_billing_is_superuser_only_and_month_generation_is_idempotent(self):
        PlatformBillingSettings.objects.create(pk=1, basic_monthly_amount_ars="99000.00", pro_monthly_amount_ars="159000.00", onboarding_amount_ars="30000.00")
        platform = User.objects.create_superuser(email="billing@demo.test", password="platform-password", name="Plataforma")
        self.client.force_login(platform)
        create = self.post_json("/api/v1/platform/schools/", {
            "name": "Alta Comercial", "slug": "alta-comercial", "school_type": "common",
            "admin_name": "Responsable", "admin_email": "responsable@alta.test",
        })
        self.assertEqual(create.status_code, 201)
        school = School.objects.get(slug="alta-comercial")
        for charge in school.subscription.charges.all():
            self.client.patch(f"/api/v1/platform/billing/charges/{charge.id}/", data=json.dumps({
                "state": "paid", "transfer_reference": f"REF-{charge.id}",
            }), content_type="application/json")
        current_month = timezone.localdate().strftime("%Y-%m")
        generated = self.post_json("/api/v1/platform/billing/charges/", {"month": current_month})
        self.assertEqual(generated.status_code, 200)
        self.assertEqual(generated.json(), {"created": 0, "existing": 1, "month": current_month})
        month_start = timezone.localdate().replace(day=1)
        previous_start = (month_start - timedelta(days=1)).replace(day=1)
        SubscriptionCharge.objects.create(subscription=school.subscription, kind=SubscriptionCharge.Kind.MONTHLY,
            period_start=previous_start, amount_ars="99000.00", due_on=timezone.localdate()-timedelta(days=1))
        listed = self.client.get("/api/v1/platform/billing/charges/").json()
        self.assertTrue(next(row for row in listed if row["period_start"] == previous_start.isoformat())["is_overdue"])
        school.refresh_from_db()
        self.assertEqual(school.state, School.State.ACTIVE)
        cancel = self.client.patch(f"/api/v1/platform/schools/{school.id}/subscription/", data=json.dumps({"state": "canceled"}), content_type="application/json")
        self.assertEqual(cancel.status_code, 200)
        school.refresh_from_db()
        self.assertEqual(school.state, School.State.SUSPENDED)
        self.assertEqual(school.subscription.state, SchoolSubscription.State.CANCELED)
        self.client.force_login(self.admin)
        response = self.client.get("/api/v1/platform/billing/charges/")
        self.assertEqual(response.status_code, 403)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_price_change_requires_advance_notice_and_is_sent_to_active_school(self):
        PlatformBillingSettings.objects.create(pk=1, basic_monthly_amount_ars="100000.00", pro_monthly_amount_ars="170000.00", onboarding_amount_ars="40000.00")
        platform = User.objects.create_superuser(email="prices@demo.test", password="platform-password", name="Plataforma")
        self.client.force_login(platform)
        created = self.post_json("/api/v1/platform/schools/", {
            "name": "Escuela Precio", "slug": "escuela-precio", "admin_name": "Responsable",
            "admin_email": "responsable@precio.test",
        })
        school = School.objects.get(pk=created.json()["id"])
        school.subscription.promo_ends_on = None
        school.subscription.renewal_monthly_amount_ars = None
        school.subscription.save(update_fields=("promo_ends_on", "renewal_monthly_amount_ars"))
        for charge in school.subscription.charges.all():
            self.client.patch(f"/api/v1/platform/billing/charges/{charge.id}/", data=json.dumps({
                "state": "paid", "transfer_reference": f"REF-{charge.id}",
            }), content_type="application/json")
        mail.outbox.clear()
        today = timezone.localdate()
        effective = (today.replace(day=1) + timedelta(days=70)).replace(day=1)
        response = self.post_json("/api/v1/platform/billing/price-changes/", {
            "plan": "basic", "monthly_amount_ars": "115000", "effective_on": (today + timedelta(days=10)).isoformat(),
        })
        self.assertEqual(response.status_code, 400)
        response = self.post_json("/api/v1/platform/billing/price-changes/", {
            "plan": "basic", "monthly_amount_ars": "115000", "effective_on": effective.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notifications_sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("115,000.00", mail.outbox[0].body)
        self.assertIn(effective.strftime("%d/%m/%Y"), mail.outbox[0].body)
        PlatformPriceChange.objects.get(effective_on=effective)
        with patch("core.views.timezone.localdate", return_value=effective):
            generated = self.post_json("/api/v1/platform/billing/charges/", {"month": effective.strftime("%Y-%m")})
        self.assertEqual(generated.status_code, 200)
        future_charge = school.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY, period_start=effective)
        self.assertEqual(str(future_charge.amount_ars), "115000.00")
        initial_charge = school.subscription.charges.filter(kind=SubscriptionCharge.Kind.MONTHLY).order_by("period_start").first()
        self.assertEqual(str(initial_charge.amount_ars), "100000.00")

    def test_pro_price_can_be_configured_after_basic_school_exists_and_unpriced_pro_is_rejected(self):
        settings_row = PlatformBillingSettings.objects.create(pk=1,
            basic_monthly_amount_ars="99000.00", pro_monthly_amount_ars="0.00", onboarding_amount_ars="30000.00")
        SchoolSubscription.objects.create(school=self.school_a, plan=SubscriptionPlan.BASIC,
            monthly_amount_ars="99000.00", onboarding_amount_ars="30000.00",
            contact_name="Directiva", contact_email=self.admin.email, state=SchoolSubscription.State.ACTIVE)
        platform = User.objects.create_superuser(email="tiers@demo.test", password="platform-password", name="Plataforma")
        self.client.force_login(platform)
        self.assertEqual(self.client.get("/api/v1/platform/billing/settings/").json(), {
            "basic_monthly_amount_ars": "99000.00", "pro_monthly_amount_ars": "0.00",
            "onboarding_amount_ars": "30000.00", "price_changes": [],
            "basic_renewal_amount_ars": "50000.00", "pro_renewal_amount_ars": "80000.00",
        })
        payload = {"name": "Pro Sin Precio", "slug": "pro-sin-precio", "school_type": "common",
            "admin_name": "Responsable", "admin_email": "responsable@pro.test", "plan": "pro"}
        rejected = self.post_json("/api/v1/platform/schools/", payload)
        self.assertEqual(rejected.status_code, 400)
        changed = self.client.patch("/api/v1/platform/billing/settings/", data=json.dumps({
            "basic_monthly_amount_ars": "99000.00", "pro_monthly_amount_ars": "159000.00",
            "onboarding_amount_ars": "30000.00",
        }), content_type="application/json")
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(str(PlatformBillingSettings.objects.get(pk=1).basic_monthly_amount_ars), "99000.00")
        settings_row.refresh_from_db()
        self.assertEqual(str(settings_row.pro_monthly_amount_ars), "159000.00")
        created = self.post_json("/api/v1/platform/schools/", payload)
        self.assertEqual(created.status_code, 201)
        school = School.objects.get(slug="pro-sin-precio")
        self.assertEqual(school.subscription.plan, SubscriptionPlan.PRO)
        first_month = school.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY)
        self.assertEqual(first_month.plan, SubscriptionPlan.PRO)
        self.assertEqual(str(first_month.amount_ars), "159000.00")

    def test_plan_change_applies_to_next_month_and_preserves_prior_charges(self):
        PlatformBillingSettings.objects.create(pk=1, basic_monthly_amount_ars="99000.00",
            pro_monthly_amount_ars="159000.00", onboarding_amount_ars="30000.00")
        platform = User.objects.create_superuser(email="switch@demo.test", password="platform-password", name="Plataforma")
        self.client.force_login(platform)
        created = self.post_json("/api/v1/platform/schools/", {"name": "Cambio de Plan", "slug": "cambio-plan",
            "school_type": "common", "admin_name": "Responsable", "admin_email": "switch@school.test", "plan": "basic"})
        school = School.objects.get(pk=created.json()["id"])
        for charge in school.subscription.charges.all():
            self.client.patch(f"/api/v1/platform/billing/charges/{charge.id}/", data=json.dumps({
                "state": "paid", "transfer_reference": f"SW-{charge.id}",
            }), content_type="application/json")
        school.refresh_from_db()
        initial = school.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY)
        old_amount = initial.amount_ars
        changed = self.client.patch(f"/api/v1/platform/schools/{school.id}/subscription/",
            data=json.dumps({"plan": "pro"}), content_type="application/json")
        self.assertEqual(changed.status_code, 200)
        effective = date.fromisoformat(changed.json()["plan_change_effective_on"])
        self.assertEqual(effective, (timezone.localdate().replace(day=28) + timedelta(days=4)).replace(day=1))
        school.subscription.refresh_from_db()
        self.assertEqual(school.subscription.plan, SubscriptionPlan.BASIC)
        self.assertEqual(school.subscription.pending_plan, SubscriptionPlan.PRO)
        self.assertEqual(str(school.subscription.pending_renewal_monthly_amount_ars), "80000.00")
        self.assertEqual(initial.plan, SubscriptionPlan.BASIC)
        self.assertEqual(initial.amount_ars, old_amount)
        locked = self.client.patch("/api/v1/platform/billing/settings/", data=json.dumps({
            "basic_monthly_amount_ars": "99000.00", "pro_monthly_amount_ars": "0.00",
            "onboarding_amount_ars": "30000.00",
        }), content_type="application/json")
        self.assertEqual(locked.status_code, 400)
        with patch("core.views.timezone.localdate", return_value=effective):
            listed = self.client.get("/api/v1/platform/schools/")
        self.assertEqual(listed.status_code, 200)
        school.subscription.refresh_from_db()
        self.assertEqual(school.subscription.plan, SubscriptionPlan.PRO)
        self.assertIsNone(school.subscription.pending_plan)
        self.assertEqual(str(school.subscription.renewal_monthly_amount_ars), "80000.00")
        with patch("core.views.timezone.localdate", return_value=effective):
            first = self.post_json("/api/v1/platform/billing/charges/", {"month": effective.strftime("%Y-%m")})
            repeated = self.post_json("/api/v1/platform/billing/charges/", {"month": effective.strftime("%Y-%m")})
        self.assertEqual(first.json()["created"], 1)
        self.assertEqual(repeated.json()["created"], 0)
        next_charge = school.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY, period_start=effective)
        school.subscription.refresh_from_db()
        self.assertEqual(next_charge.plan, SubscriptionPlan.PRO)
        self.assertEqual(str(next_charge.amount_ars), "159000.00")
        self.assertEqual(school.subscription.plan, SubscriptionPlan.PRO)
        self.assertIsNone(school.subscription.pending_plan)
        initial.refresh_from_db()
        self.assertEqual(initial.plan, SubscriptionPlan.BASIC)
        self.assertEqual(initial.amount_ars, old_amount)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_price_adjustment_targets_only_selected_plan_and_future_charges(self):
        PlatformBillingSettings.objects.create(pk=1, basic_monthly_amount_ars="99000.00",
            pro_monthly_amount_ars="159000.00", onboarding_amount_ars="30000.00")
        self.school_a.state = School.State.ACTIVE
        self.school_a.save(update_fields=("state",))
        self.school_b.state = School.State.ACTIVE
        self.school_b.save(update_fields=("state",))
        SchoolSubscription.objects.create(school=self.school_a, state=SchoolSubscription.State.ACTIVE,
            plan=SubscriptionPlan.BASIC, monthly_amount_ars="99000.00", onboarding_amount_ars="30000.00",
            contact_name="Básico", contact_email="basico@rio.test")
        SchoolSubscription.objects.create(school=self.school_b, state=SchoolSubscription.State.ACTIVE,
            plan=SubscriptionPlan.PRO, monthly_amount_ars="159000.00", onboarding_amount_ars="30000.00",
            contact_name="Pro", contact_email="pro@sur.test")
        platform = User.objects.create_superuser(email="adjust@demo.test", password="platform-password", name="Plataforma")
        self.client.force_login(platform)
        today = timezone.localdate()
        effective = (today.replace(day=1) + timedelta(days=70)).replace(day=1)
        response = self.post_json("/api/v1/platform/billing/price-changes/", {
            "plan": "pro", "monthly_amount_ars": "180000.00", "effective_on": effective.isoformat(),
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["notifications_sent"], 1)
        self.assertEqual(mail.outbox[0].to, ["pro@sur.test"])
        with patch("core.views.timezone.localdate", return_value=effective):
            generated = self.post_json("/api/v1/platform/billing/charges/", {"month": effective.strftime("%Y-%m")})
        self.assertEqual(generated.json()["created"], 2)
        basic_charge = self.school_a.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY, period_start=effective)
        pro_charge = self.school_b.subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY, period_start=effective)
        self.assertEqual((basic_charge.plan, str(basic_charge.amount_ars)), (SubscriptionPlan.BASIC, "99000.00"))
        self.assertEqual((pro_charge.plan, str(pro_charge.amount_ars)), (SubscriptionPlan.PRO, "180000.00"))

    def test_academic_analytics_are_pro_only_filtered_and_school_scoped(self):
        year = timezone.localdate().year
        first = AcademicPeriod.objects.create(school=self.school_a, name="Primer informe", year=year, order=1)
        second = AcademicPeriod.objects.create(school=self.school_a, name="Segundo informe", year=year, order=2)
        SchoolSubscription.objects.create(school=self.school_a, state=SchoolSubscription.State.ACTIVE,
            plan=SubscriptionPlan.PRO, monthly_amount_ars="159000.00", onboarding_amount_ars="30000.00",
            contact_name="Directiva", contact_email=self.admin.email)
        self.school_a.state = School.State.ACTIVE
        self.school_a.save(update_fields=("state",))
        alternate_plan = AcademicPlan.objects.create(school=self.school_a, name="Plan Alternativo",
            school_type=self.school_a.school_type, valid_from_year=year)
        second_year = PlanYear.objects.create(school=self.school_a, plan=alternate_plan,
            year_label="2° año", ordinal=2)
        second_section = Section.objects.create(school=self.school_a, plan_year=second_year,
            academic_year=year, division="B", shift=Section.Shift.MORNING)
        second_student = self.student(self.school_a, second_section, "Estudiante dos", "RIO-2")
        english = Subject.objects.create(school=self.school_a, name="Inglés")
        english_offering = Offering.objects.create(school=self.school_a, section=self.section_a, subject=english)
        math_second = Offering.objects.create(school=self.school_a, section=second_section, subject=self.math_a)
        Grade.objects.create(school=self.school_a, student=self.student_a, offering=self.offering_a, period=first, value="8")
        Grade.objects.create(school=self.school_a, student=self.student_a, offering=self.offering_a, period=second, value="2")
        Grade.objects.create(school=self.school_a, student=self.student_a, offering=english_offering, period=first, value="10")
        Grade.objects.create(school=self.school_a, student=second_student, offering=math_second, period=first, value="6")
        self.sign_in(self.admin, self.school_a)
        me = self.client.get("/api/v1/me/").json()
        self.assertTrue(me["analytics_enabled"])
        result = self.client.get(f"/api/v1/analytics/academic/?year={year}&period_id={first.id}&subject_id={self.math_a.id}")
        self.assertEqual(result.status_code, 200)
        data = result.json()
        self.assertEqual(data["summary"]["average"], 7.0)
        self.assertEqual(data["summary"]["approved_percentage"], 100.0)
        self.assertEqual(data["summary"]["grade_count"], 2)
        self.assertEqual(len(data["by_section"]), 2)
        self.assertEqual(len(data["by_student"]), 2)
        self.assertEqual(data["distribution"], [{"grade": 6.0, "count": 1}, {"grade": 8.0, "count": 1}])
        self.assertEqual(len(data["by_period"]), 1)
        foreign_section = self.section_b.id
        invalid = self.client.get(f"/api/v1/analytics/academic/?year={year}&section_id={foreign_section}")
        self.assertEqual(invalid.status_code, 400)
        self.sign_in(self.teacher, self.school_a)
        self.assertEqual(self.client.get(f"/api/v1/analytics/academic/?year={year}").status_code, 403)
        self.sign_in(self.admin, self.school_b)
        SchoolSubscription.objects.create(school=self.school_b, state=SchoolSubscription.State.ACTIVE,
            plan=SubscriptionPlan.BASIC, monthly_amount_ars="99000.00", onboarding_amount_ars="30000.00",
            contact_name="Directivo", contact_email=self.admin.email)
        self.school_b.state = School.State.ACTIVE
        self.school_b.save(update_fields=("state",))
        self.assertFalse(self.client.get("/api/v1/me/").json()["analytics_enabled"])
        self.assertEqual(self.client.get(f"/api/v1/analytics/academic/?year={year}").status_code, 403)

    def test_guardian_can_mark_visible_notice_as_read_and_only_sees_school_events(self):
        guardian = self.user("familia@rio.test", "Familia Río")
        self.member(guardian, self.school_a, Membership.Role.GUARDIAN)
        StudentGuardian.objects.create(school=self.school_a, student=self.student_a, guardian=guardian)
        notice = Notice.objects.create(school=self.school_a, title="Reunión", body="El jueves", audience=Notice.Audience.GUARDIANS)
        future = timezone.now() + timedelta(days=2)
        SchoolEvent.objects.create(school=self.school_a, title="Reunión familiar", starts_at=future, audience=Notice.Audience.GUARDIANS)
        SchoolEvent.objects.create(school=self.school_b, title="Evento de otra escuela", starts_at=future, audience=Notice.Audience.GUARDIANS)
        self.sign_in(guardian, self.school_a)
        notices = self.client.get("/api/v1/notices/").json()
        self.assertEqual(len(notices), 1)
        self.assertFalse(notices[0]["is_read"])
        read = self.client.post(f"/api/v1/notices/{notice.id}/read/", data="{}", content_type="application/json")
        self.assertEqual(read.status_code, 201)
        self.assertEqual(NoticeRead.objects.filter(notice=notice, user=guardian).count(), 1)
        self.assertTrue(self.client.get("/api/v1/notices/").json()[0]["is_read"])
        events = self.client.get("/api/v1/events/").json()
        self.assertEqual([event["title"] for event in events], ["Reunión familiar"])

    def test_school_staff_can_create_calendar_events_and_guardians_cannot(self):
        self.sign_in(self.admin, self.school_a)
        start = (timezone.now() + timedelta(days=5)).isoformat()
        response = self.post_json("/api/v1/events/", {"title": "Acto escolar", "starts_at": start, "audience": "Familias"})
        self.assertEqual(response.status_code, 201)
        event_id = response.json()["id"]
        self.assertEqual(self.client.get("/api/v1/events/").json()[0]["title"], "Acto escolar")
        guardian = self.user("familia2@rio.test", "Familia")
        self.member(guardian, self.school_a, Membership.Role.GUARDIAN)
        self.sign_in(guardian, self.school_a)
        response = self.post_json("/api/v1/events/", {"title": "No autorizado", "starts_at": start})
        self.assertEqual(response.status_code, 403)
        response = self.client.delete(f"/api/v1/events/{event_id}/")
        self.assertEqual(response.status_code, 403)

    def test_academic_followup_is_school_scoped_and_report_card_download_is_pdf(self):
        today = timezone.localdate()
        AcademicPeriod.objects.create(school=self.school_a, name="1° informe", year=today.year, order=1,
            report_slot=AcademicPeriod.ReportSlot.FIRST, starts_on=today.replace(month=1, day=1), ends_on=today.replace(month=12, day=31))
        Attendance.objects.create(school=self.school_a, student=self.student_a, date=today,
            status=Attendance.Status.ABSENT, recorded_by=self.admin)
        self.sign_in(self.admin, self.school_a)
        followup = self.client.get("/api/v1/academic-followup/")
        self.assertEqual(followup.status_code, 200)
        self.assertEqual(followup.json()["absence_count"], 1)
        self.assertEqual(followup.json()["pending_grade_count"], 1)
        pdf = self.client.get(f"/api/v1/report-cards/{self.student_a.id}/?year={today.year}&format=pdf")
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf["Content-Type"], "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF"))

    def test_student_cannot_import_or_export_school_data(self):
        student_user = self.user("alumno@rio.test", "Estudiante")
        self.member(student_user, self.school_a, Membership.Role.STUDENT)
        self.student_a.account = student_user
        self.student_a.save(update_fields=("account",))
        self.sign_in(student_user, self.school_a)
        response = self.client.get("/api/v1/exports/students/")
        self.assertEqual(response.status_code, 403)
        upload = SimpleUploadedFile("alumnos.csv", b"name,course,division\n", content_type="text/csv")
        response = self.client.post("/api/v1/imports/preview/", {"resource": "students", "file": upload})
        self.assertEqual(response.status_code, 403)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_guardian_invitation_can_link_multiple_students_in_one_school(self):
        sibling = self.student(self.school_a, self.section_a, "Hermano", "RIO-2")
        self.sign_in(self.admin, self.school_a)
        response = self.post_json("/api/v1/settings/", {
            "kind": "user", "name": "Responsable", "email": "responsable@rio.test", "role": "tutor",
            "linked_student_ids": [self.student_a.id, sibling.id],
        })
        self.assertEqual(response.status_code, 201)
        guardian = User.objects.get(email="responsable@rio.test")
        self.assertEqual(StudentGuardian.objects.filter(school=self.school_a, guardian=guardian).count(), 2)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(Membership.objects.get(school=self.school_a, user=guardian).role, Membership.Role.GUARDIAN)


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL row-level security")
class PostgreSQLRowLevelSecurityTestCase(TestCase):
    def setUp(self):
        self.school_a = School.objects.create(name="A RLS", slug="a-rls")
        self.school_b = School.objects.create(name="B RLS", slug="b-rls")
        self.student_a = Student.objects.create(school=self.school_a, name="A student")
        self.student_b = Student.objects.create(school=self.school_b, name="B student")

    def assume_app_role_for_school(self, school):
        with connection.cursor() as cursor:
            cursor.execute("GRANT USAGE ON SCHEMA public TO nexo_app")
            cursor.execute(
                "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexo_app"
            )
            cursor.execute(
                "GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nexo_app"
            )
            cursor.execute("SET ROLE nexo_app")
            cursor.execute(
                "SELECT set_config('app.current_school_id', %s, true)",
                [str(school.pk)],
            )

    def test_app_role_can_only_read_rows_for_the_current_school(self):
        self.assume_app_role_for_school(self.school_a)
        visible = set(Student.objects.values_list("pk", flat=True))
        self.assertEqual(visible, {self.student_a.pk})
        self.assertFalse(Student.objects.filter(pk=self.student_b.pk).exists())

    def test_app_role_cannot_insert_for_another_school(self):
        self.assume_app_role_for_school(self.school_a)
        with self.assertRaises(DatabaseError):
            with transaction.atomic():
                Student.objects.create(school=self.school_b, name="Cross-school insert")



class SchoolSignupFlowTestCase(TestCase):
    def setUp(self):
        PlatformBillingSettings.objects.create(pk=1, basic_monthly_amount_ars="125000.00",
            pro_monthly_amount_ars="200000.00", onboarding_amount_ars="80000.00")
        self.platform_admin = User.objects.create_superuser(email="nexo@nexo.test", password="strong-test-password",
            name="Nexo")

    def signup_payload(self, **overrides):
        payload = {"school_name": "Escuela Nueva", "school_type": "technical", "jurisdiction": "Córdoba",
            "contact_name": "Directora Nueva", "contact_email": "directora@escuela.test",
            "contact_phone": "+54 9 351 123 4567", "plan": "pro", "website": ""}
        payload.update(overrides)
        return payload

    def create_signup(self, **overrides):
        return self.client.post("/api/v1/public/school-signups/", data=json.dumps(self.signup_payload(**overrides)),
            content_type="application/json")

    def verify_latest_signup(self):
        verify_url = next(line for line in mail.outbox[-1].body.splitlines() if line.startswith("http://"))
        path = urlsplit(verify_url).path
        preview = self.client.get(path)
        self.assertEqual(preview.status_code, 200)
        signup = SchoolSignupRequest.objects.get()
        self.assertEqual(signup.state, SchoolSignupRequest.State.EMAIL_PENDING)
        response = self.client.post(path)
        self.assertEqual(response.status_code, 302)
        signup.refresh_from_db()
        self.assertEqual(signup.state, SchoolSignupRequest.State.VERIFIED)
        return signup

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", NEXO_WHATSAPP_NUMBER="+54 9 11 1234 5678")
    def test_public_request_is_isolated_until_email_verification_and_whatsapp_link_is_prefilled(self):
        page = self.client.get("/registro/")
        self.assertContains(page, "Básico")
        self.assertContains(page, "Pro")
        self.assertContains(page, "280000.00")
        response = self.create_signup()
        self.assertEqual(response.status_code, 202)
        self.assertEqual(SchoolSignupRequest.objects.count(), 1)
        self.assertEqual(School.objects.count(), 0)
        self.assertEqual(SchoolSubscription.objects.count(), 0)
        self.assertEqual(SubscriptionCharge.objects.count(), 0)
        signup = self.verify_latest_signup()
        result = self.client.get(f"/registro/solicitud/{signup.id}/")
        self.assertEqual(result.status_code, 200)
        whatsapp_url = result.context["whatsapp_url"]
        parsed = urlsplit(whatsapp_url)
        from urllib.parse import parse_qs
        self.assertEqual(parsed.netloc, "wa.me")
        self.assertEqual(parsed.path, "/5491112345678")
        message = parse_qs(parsed.query)["text"][0]
        self.assertIn(str(signup.id), message)
        self.assertIn("Escuela Nueva", message)
        self.assertIn("Pro", message)
        self.assertIn("280000.00", str(result.context["initial_total_ars"]))
        self.assertEqual(self.client.get(urlsplit(next(line for line in mail.outbox[0].body.splitlines() if line.startswith("http://"))).path).status_code, 410)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_honeypot_validation_and_ip_email_throttles_do_not_create_extra_requests(self):
        response = self.create_signup(website="bot-filled-this")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(SchoolSignupRequest.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(self.create_signup(contact_email="invalid-address").status_code, 400)
        self.assertEqual(SchoolSignupRequest.objects.count(), 0)
        for index in range(3):
            response = self.create_signup(school_name=f"Escuela {index}")
            self.assertEqual(response.status_code, 202)
        limited = self.create_signup(school_name="Escuela cuarta")
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(SchoolSignupRequest.objects.count(), 3)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_only_platform_admin_can_convert_verified_request_once(self):
        self.create_signup()
        signup = SchoolSignupRequest.objects.get()
        unauthorized = self.client.post(f"/api/v1/platform/school-signups/{signup.id}/approve/", data="{}",
            content_type="application/json")
        self.assertEqual(unauthorized.status_code, 403)
        self.client.force_login(self.platform_admin)
        unverified = self.client.post(f"/api/v1/platform/school-signups/{signup.id}/approve/", data="{}",
            content_type="application/json")
        self.assertEqual(unverified.status_code, 400)
        self.assertEqual(School.objects.count(), 0)
        signup = self.verify_latest_signup()
        approved = self.client.post(f"/api/v1/platform/school-signups/{signup.id}/approve/", data="{}",
            content_type="application/json")
        self.assertEqual(approved.status_code, 201)
        school = School.objects.get()
        self.assertEqual(school.state, School.State.ONBOARDING)
        self.assertEqual(school.subscription.plan, SubscriptionPlan.PRO)
        self.assertEqual(school.subscription.monthly_amount_ars, signup.monthly_quote_ars)
        self.assertEqual(school.subscription.onboarding_amount_ars, signup.onboarding_quote_ars)
        self.assertEqual(school.subscription.charges.count(), 2)
        self.assertEqual(Membership.objects.filter(school=school).count(), 0)
        duplicate = self.client.post(f"/api/v1/platform/school-signups/{signup.id}/approve/", data="{}",
            content_type="application/json")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(School.objects.count(), 1)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_zero_cost_self_service_and_promo_renewal_are_disclosed_and_charged(self):
        pricing = PlatformBillingSettings.objects.get(pk=1)
        pricing.basic_monthly_amount_ars = "15000.00"
        pricing.pro_monthly_amount_ars = "20000.00"
        pricing.onboarding_amount_ars = "0.00"
        pricing.save()
        page = self.client.get("/registro/")
        self.assertContains(page, "20000.00")
        self.assertContains(page, "80000.00")
        self.create_signup()
        signup = self.verify_latest_signup()
        self.client.force_login(self.platform_admin)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"/api/v1/platform/school-signups/{signup.id}/approve/",
                data="{}", content_type="application/json")
        self.assertEqual(response.status_code, 201)
        subscription = SchoolSubscription.objects.get(school_id=response.json()["id"])
        self.assertEqual(subscription.charges.count(), 1)
        self.assertIsNotNone(subscription.promo_ends_on)
        self.assertEqual(subscription.renewal_monthly_amount_ars, 80000)
        self.assertIn(subscription.promo_ends_on.strftime("%d/%m/%Y"), mail.outbox[-1].body)
        public_quote = self.client.get(f"/registro/solicitud/{signup.id}/")
        self.assertContains(public_quote, subscription.promo_ends_on.strftime("%d/%m/%Y"))
        first_month = subscription.charges.get(kind=SubscriptionCharge.Kind.MONTHLY)
        paid = self.client.patch(f"/api/v1/platform/billing/charges/{first_month.id}/",
            data=json.dumps({"state": "paid", "transfer_reference": "PROMO-1"}),
            content_type="application/json")
        self.assertEqual(paid.status_code, 200)
        subscription.refresh_from_db()
        self.assertEqual(subscription.state, SchoolSubscription.State.ACTIVE)

    def test_existing_price_stays_put_and_new_school_renews_after_promo(self):
        from .views import subscription_price_for
        legacy = SchoolSubscription.objects.create(school=self.school_for_price_test(),
            plan=SubscriptionPlan.PRO, state=SchoolSubscription.State.ACTIVE,
            monthly_amount_ars="12000.00", onboarding_amount_ars="2000.00",
            contact_name="Dirección", contact_email="old@school.test")
        self.assertEqual(str(subscription_price_for(legacy, timezone.localdate().replace(day=1), SubscriptionPlan.PRO)), "12000.00")
        legacy.promo_ends_on = date(2027, 9, 28)
        legacy.renewal_monthly_amount_ars = 80000
        legacy.monthly_amount_ars = 20000
        self.assertEqual(str(subscription_price_for(legacy, date(2027, 9, 1), SubscriptionPlan.PRO)), "20000")
        self.assertEqual(str(subscription_price_for(legacy, date(2027, 10, 1), SubscriptionPlan.PRO)), "80000")

    def school_for_price_test(self):
        return School.objects.create(name="Escuela previa", slug="escuela-previa")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_requoted_request_activates_school_and_invites_school_admin_after_both_payments(self):
        self.create_signup()
        signup = self.verify_latest_signup()
        signup.quote_expires_at = timezone.now() - timedelta(days=1)
        signup.save(update_fields=("quote_expires_at",))
        self.client.force_login(self.platform_admin)
        approve_url = f"/api/v1/platform/school-signups/{signup.id}/approve/"
        expired = self.client.post(approve_url, data="{}", content_type="application/json")
        self.assertEqual(expired.status_code, 400)
        self.assertEqual(School.objects.count(), 0)
        requote = self.client.post(f"/api/v1/platform/school-signups/{signup.id}/requote/",
            data=json.dumps({"whatsapp_confirmed": True}), content_type="application/json")
        self.assertEqual(requote.status_code, 200)
        self.assertEqual(self.client.post(approve_url, data="{}", content_type="application/json").status_code, 201)
        subscription = SchoolSubscription.objects.get()
        charges = list(subscription.charges.order_by("kind"))
        for index, charge in enumerate(charges):
            response = self.client.patch(f"/api/v1/platform/billing/charges/{charge.id}/", data=json.dumps({
                "state": "paid", "transfer_reference": f"TRANSFER-{index}"}), content_type="application/json")
            self.assertEqual(response.status_code, 200)
            if index == 0:
                self.assertFalse(response.json()["school_activated"])
                self.assertEqual(subscription.school.state, School.State.ONBOARDING)
        subscription.refresh_from_db()
        self.assertEqual(subscription.state, SchoolSubscription.State.ACTIVE)
        self.assertEqual(subscription.school.state, School.State.ACTIVE)
        director = User.objects.get(email="directora@escuela.test")
        self.assertEqual(Membership.objects.get(school=subscription.school, user=director).role, Membership.Role.SCHOOL_ADMIN)
        self.assertFalse(director.has_usable_password())
        self.assertEqual(len(mail.outbox), 2)  # verification and director invitation
        self.assertIn("/accounts/reset/", mail.outbox[-1].body)

    def test_expired_requests_are_purged_and_missing_whatsapp_number_has_no_broken_link(self):
        response = self.create_signup(contact_email="otra@escuela.test")
        self.assertEqual(response.status_code, 202)
        signup = SchoolSignupRequest.objects.get()
        SchoolSignupRequest.objects.filter(pk=signup.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.client.get("/registro/")
        self.assertFalse(SchoolSignupRequest.objects.filter(pk=signup.pk).exists())

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", NEXO_WHATSAPP_NUMBER="")
    def test_verified_request_without_whatsapp_configuration_shows_no_dead_link(self):
        self.create_signup()
        signup = self.verify_latest_signup()
        result = self.client.get(f"/registro/solicitud/{signup.id}/")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.context["whatsapp_url"], "")
        self.assertNotContains(result, "https://wa.me/")
