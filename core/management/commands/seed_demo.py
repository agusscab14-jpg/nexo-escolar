from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import (
    AcademicPeriod, AcademicPlan, Attendance, Book, Claim, Enrollment, Grade,
    GradingScale, LostItem, Loan, Membership, Notice, Offering, PlanSubject,
    PlanYear, School, Section, Student, StudentGuardian, Subject,
    TeacherAssignment, User,
)


class Command(BaseCommand):
    help = "Carga datos ficticios para probar una secundaria común y una técnica."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo solo está habilitado en modo DEBUG.")
        year = timezone.localdate().year
        platform = self.user("admin@demo.edu", "Administración Nexo", superuser=True)
        director = self.user("directivo@demo.edu", "Patricia Gómez")
        schools = [
            ("Escuela Demo Secundaria Común", "demo-comun", School.Type.COMMON, "", [
                ("Lengua y Literatura", Subject.Kind.SUBJECT), ("Matemática", Subject.Kind.SUBJECT),
                ("Historia", Subject.Kind.SUBJECT), ("Inglés", Subject.Kind.SUBJECT)]),
            ("Escuela Demo Técnica", "demo-tecnica", School.Type.TECHNICAL, "Informática", [
                ("Lengua y Literatura", Subject.Kind.SUBJECT), ("Matemática", Subject.Kind.SUBJECT),
                ("Programación", Subject.Kind.SUBJECT), ("Taller de electrónica", Subject.Kind.WORKSHOP),
                ("Laboratorio de sistemas", Subject.Kind.WORKSHOP)]),
        ]
        for school_name, slug, school_type, orientation, subject_defs in schools:
            school, _ = School.objects.update_or_create(slug=slug, defaults={
                "name": school_name, "school_type": school_type, "jurisdiction": "Provincia a definir",
                "state": School.State.TRIAL,
            })
            Membership.objects.update_or_create(school=school, user=director, defaults={"role": Membership.Role.DIRECTOR, "is_active": True})
            if not school.memberships.filter(user=platform).exists():
                Membership.objects.create(school=school, user=platform, role=Membership.Role.SCHOOL_ADMIN)
            admin_user = self.user(f"admin-{slug}@demo.edu", f"Administración {school_name}")
            Membership.objects.update_or_create(school=school, user=admin_user, defaults={"role": Membership.Role.SCHOOL_ADMIN, "is_active": True})
            librarian = self.user(f"biblioteca-{slug}@demo.edu", "Biblioteca")
            Membership.objects.update_or_create(school=school, user=librarian, defaults={"role": Membership.Role.LIBRARIAN, "is_active": True})
            teacher = self.user(f"docente-{slug}@demo.edu", "Docente de demostración")
            teacher_membership, _ = Membership.objects.update_or_create(school=school, user=teacher, defaults={"role": Membership.Role.TEACHER, "is_active": True})
            secretary = self.user(f"secretaria-{slug}@demo.edu", "Secretaría")
            Membership.objects.update_or_create(school=school, user=secretary, defaults={"role": Membership.Role.SECRETARY, "is_active": True})
            preceptor = self.user(f"preceptor-{slug}@demo.edu", "Preceptoría")
            Membership.objects.update_or_create(school=school, user=preceptor, defaults={"role": Membership.Role.PRECEPTOR, "is_active": True})
            GradingScale.objects.get_or_create(school=school, name="Escala general", defaults={"minimum": 1, "maximum": 10, "passing": 6})
            plan, _ = AcademicPlan.objects.get_or_create(school=school, name=f"Plan {year}", valid_from_year=year, defaults={
                "school_type": school_type, "jurisdiction": school.jurisdiction, "orientation": orientation, "is_active": True})
            subjects = []
            for subject_name, kind in subject_defs:
                subject, _ = Subject.objects.get_or_create(school=school, name=subject_name, kind=kind)
                subjects.append(subject)
            plan_year, _ = PlanYear.objects.get_or_create(school=school, plan=plan, ordinal=1, defaults={
                "year_label": "1° año", "cycle": "Ciclo básico", "orientation": orientation})
            for subject in subjects:
                PlanSubject.objects.get_or_create(school=school, plan_year=plan_year, subject=subject, defaults={"weekly_hours": 3})
            section, _ = Section.objects.get_or_create(school=school, plan_year=plan_year, academic_year=year,
                division="A", shift=Section.Shift.MORNING, defaults={"name": f"1° A · {year}"})
            period, _ = AcademicPeriod.objects.get_or_create(school=school, name="Primer trimestre", year=year, defaults={"order": 1})
            for subject in subjects:
                offering, _ = Offering.objects.get_or_create(school=school, section=section, subject=subject)
                TeacherAssignment.objects.get_or_create(school=school, offering=offering, membership=teacher_membership)
            students = []
            for number, student_name in enumerate(("Camila Ríos", "Tomás Fernández"), start=1):
                student, _ = Student.objects.get_or_create(school=school, source_id=f"DEMO-{slug}-{number}", defaults={
                    "name": student_name, "email": f"alumno{number}-{slug}@demo.edu", "status": Student.Status.ACTIVE})
                Enrollment.objects.get_or_create(school=school, student=student, academic_year=year, defaults={"section": section})
                students.append(student)
                student_user = self.user(f"alumno{number}-{slug}@demo.edu", student_name)
                Membership.objects.update_or_create(school=school, user=student_user, defaults={"role": Membership.Role.STUDENT, "is_active": True})
                student.account = student_user
                student.save(update_fields=("account",))
                guardian = self.user(f"familia{number}-{slug}@demo.edu", f"Familia de {student_name}")
                Membership.objects.update_or_create(school=school, user=guardian, defaults={"role": Membership.Role.GUARDIAN, "is_active": True})
                StudentGuardian.objects.get_or_create(school=school, student=student, guardian=guardian, defaults={"relationship": "Responsable"})
                Attendance.objects.get_or_create(school=school, student=student, date=timezone.localdate(), offering=None,
                    defaults={"status": Attendance.Status.PRESENT, "recorded_by": director})
                if subjects:
                    offering = Offering.objects.get(school=school, section=section, subject=subjects[0])
                    Grade.objects.get_or_create(school=school, student=student, offering=offering, period=period,
                        defaults={"value": 8, "note": "Registro de demostración", "recorded_by": director})
            book, _ = Book.objects.get_or_create(school=school, code=f"DEMO-{slug}", defaults={"title": "La escuela y sus historias", "author": "Biblioteca Nexo", "copies": 3})
            Loan.objects.get_or_create(school=school, book=book, student=students[0], returned_at=None,
                defaults={"due_at": timezone.localdate() + timedelta(days=14), "recorded_by": librarian})
            LostItem.objects.get_or_create(school=school, title="Botella azul", defaults={"description": "Botella reutilizable hallada en el patio.", "place": "Patio", "created_by": librarian})
            Notice.objects.get_or_create(school=school, title="Bienvenidos al ciclo lectivo", defaults={
                "body": "Este es un aviso de ejemplo para probar la plataforma.", "audience": Notice.Audience.ALL, "created_by": director})
            self.stdout.write(self.style.SUCCESS(f"Preparada: {school.name}"))
        self.stdout.write(self.style.WARNING("Cuentas ficticias: contraseña demo123. No uses estas cuentas en producción."))
        self.stdout.write(f"Admin. plataforma: admin@demo.edu | Directivo multi escuela: directivo@demo.edu")

    def user(self, email, name, superuser=False):
        user, created = User.objects.get_or_create(email=email, defaults={"name": name, "is_active": True})
        if created or not user.has_usable_password():
            user.set_password("demo123")
            user.save(update_fields=("password",))
        if superuser and not user.is_superuser:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=("is_staff", "is_superuser"))
        return user
