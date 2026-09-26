from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.db.models import Q
from django.utils import timezone
import uuid


class NexoUserManager(UserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Se requiere un correo electrónico")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=160)
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = NexoUserManager()

    def __str__(self):
        return self.name or self.email


class School(models.Model):
    class Type(models.TextChoices):
        COMMON = "common", "Secundaria común"
        TECHNICAL = "technical", "Técnica"

    class State(models.TextChoices):
        ONBOARDING = "onboarding", "Alta pendiente"
        TRIAL = "trial", "Piloto"
        ACTIVE = "active", "Activa"
        SUSPENDED = "suspended", "Suspendida"

    class Theme(models.TextChoices):
        FOREST = "forest", "Bosque"
        OCEAN = "ocean", "Océano"
        VIOLET = "violet", "Violeta"
        TERRACOTTA = "terracotta", "Terracota"

    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=100, unique=True)
    school_type = models.CharField(max_length=20, choices=Type.choices, default=Type.COMMON)
    jurisdiction = models.CharField(max_length=120, blank=True)
    state = models.CharField(max_length=20, choices=State.choices, default=State.TRIAL)
    timezone = models.CharField(max_length=80, default="America/Argentina/Buenos_Aires")
    theme = models.CharField(max_length=24, choices=Theme.choices, default=Theme.FOREST)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    class Role(models.TextChoices):
        SCHOOL_ADMIN = "school_admin", "Administración escolar"
        DIRECTOR = "directivo", "Directivo"
        SECRETARY = "secretaria", "Secretaría"
        PRECEPTOR = "preceptor", "Preceptoría"
        TEACHER = "docente", "Docente"
        LIBRARIAN = "biblioteca", "Biblioteca"
        STUDENT = "alumno", "Alumno"
        GUARDIAN = "tutor", "Tutor"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=24, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "user"), name="unique_school_membership")]
        indexes = [models.Index(fields=("user", "is_active"))]


class Student(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        INACTIVE = "inactive", "Inactivo"
        GRADUATED = "graduated", "Egresado"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="students")
    source_id = models.CharField(max_length=80, blank=True)
    name = models.CharField(max_length=180)
    email = models.EmailField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    account = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="student_profiles")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "source_id"), condition=~Q(source_id=""), name="unique_student_source_per_school")]
        indexes = [models.Index(fields=("school", "name"))]

    def __str__(self):
        return self.name


class StudentGuardian(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="guardian_links")
    guardian = models.ForeignKey(User, on_delete=models.CASCADE, related_name="guarded_students")
    relationship = models.CharField(max_length=60, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "student", "guardian"), name="unique_student_guardian")]


class Course(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="courses")
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "name"), name="unique_course_per_school")]
        ordering = ("name",)

    def __str__(self):
        return self.name


class Subject(models.Model):
    class Kind(models.TextChoices):
        SUBJECT = "subject", "Materia"
        WORKSHOP = "workshop", "Taller"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="subjects")
    name = models.CharField(max_length=140)
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.SUBJECT)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "name", "kind"), name="unique_subject_kind_per_school")]
        ordering = ("name",)

    def __str__(self):
        return self.name


class AcademicPlan(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="academic_plans")
    name = models.CharField(max_length=180)
    school_type = models.CharField(max_length=20, choices=School.Type.choices)
    jurisdiction = models.CharField(max_length=120, blank=True)
    orientation = models.CharField(max_length=140, blank=True)
    valid_from_year = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "name", "valid_from_year"), name="unique_plan_version")]
        ordering = ("-valid_from_year", "name")


class PlanYear(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="plan_years")
    plan = models.ForeignKey(AcademicPlan, on_delete=models.CASCADE, related_name="years")
    year_label = models.CharField(max_length=50)
    ordinal = models.PositiveSmallIntegerField()
    cycle = models.CharField(max_length=100, blank=True)
    orientation = models.CharField(max_length=140, blank=True)
    subjects = models.ManyToManyField(Subject, through="PlanSubject", related_name="plan_years")

    class Meta:
        constraints = [models.UniqueConstraint(fields=("plan", "ordinal"), name="unique_ordinal_per_plan")]
        ordering = ("ordinal",)


class PlanSubject(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    plan_year = models.ForeignKey(PlanYear, on_delete=models.CASCADE, related_name="subject_entries")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE)
    weekly_hours = models.DecimalField(max_digits=4, decimal_places=1, default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("plan_year", "subject"), name="unique_subject_in_plan_year")]


class Section(models.Model):
    class Shift(models.TextChoices):
        MORNING = "morning", "Mañana"
        AFTERNOON = "afternoon", "Tarde"
        EVENING = "evening", "Vespertino"
        NIGHT = "night", "Noche"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="sections")
    plan_year = models.ForeignKey(PlanYear, on_delete=models.PROTECT, related_name="sections")
    academic_year = models.PositiveSmallIntegerField()
    division = models.CharField(max_length=30)
    shift = models.CharField(max_length=20, choices=Shift.choices, default=Shift.MORNING)
    name = models.CharField(max_length=120, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "plan_year", "academic_year", "division", "shift"), name="unique_section_year_division")]
        ordering = ("academic_year", "division", "shift")


class Enrollment(models.Model):
    class State(models.TextChoices):
        ACTIVE = "active", "Activa"
        TRANSFERRED = "transferred", "Pase"
        PROMOTED = "promoted", "Promovida"
        WITHDRAWN = "withdrawn", "Baja"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="enrollments")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="enrollments")
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="enrollments")
    academic_year = models.PositiveSmallIntegerField()
    state = models.CharField(max_length=20, choices=State.choices, default=State.ACTIVE)
    started_at = models.DateField(default=timezone.localdate)
    ended_at = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "student", "academic_year"), name="unique_student_year_enrollment")]
        indexes = [models.Index(fields=("school", "academic_year", "state"))]


class AcademicPeriod(models.Model):
    class ReportSlot(models.TextChoices):
        AUTO = "auto", "Automático por orden y nombre"
        FIRST = "report_1", "1° informe"
        SECOND = "report_2", "2° informe"
        THIRD = "report_3", "3° informe"
        EXTENDED = "extended", "Período extendido"
        FINAL = "final", "Informe final"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="periods")
    name = models.CharField(max_length=80)
    year = models.PositiveSmallIntegerField()
    order = models.PositiveSmallIntegerField(default=1)
    report_slot = models.CharField(max_length=16, choices=ReportSlot.choices, default=ReportSlot.AUTO)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "name", "year"), name="unique_period_year_school")]
        ordering = ("year", "order")


class GradingScale(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="grading_scales")
    name = models.CharField(max_length=100, default="Escala general")
    minimum = models.DecimalField(max_digits=5, decimal_places=2, default=1)
    maximum = models.DecimalField(max_digits=5, decimal_places=2, default=10)
    passing = models.DecimalField(max_digits=5, decimal_places=2, default=6)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "name"), name="unique_grading_scale_school")]


class Offering(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="offerings")
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="offerings")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="offerings")

    class Meta:
        constraints = [models.UniqueConstraint(fields=("section", "subject"), name="unique_offering_section_subject")]


class TeacherAssignment(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE)
    offering = models.ForeignKey(Offering, on_delete=models.CASCADE, related_name="teacher_assignments")
    membership = models.ForeignKey(Membership, on_delete=models.CASCADE, related_name="teaching_assignments")

    class Meta:
        constraints = [models.UniqueConstraint(fields=("offering", "membership"), name="unique_teacher_offering")]


class Attendance(models.Model):
    class Status(models.TextChoices):
        PRESENT = "present", "Presente"
        ABSENT = "absent", "Ausente"
        LATE = "late", "Tarde"
        EXCUSED = "excused", "Justificado"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="attendance_records")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="attendance_records")
    date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices)
    note = models.CharField(max_length=500, blank=True)
    offering = models.ForeignKey(Offering, null=True, blank=True, on_delete=models.SET_NULL, related_name="attendance_records")
    recorded_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("student", "date"), condition=Q(offering__isnull=True), name="unique_daily_attendance"),
            models.UniqueConstraint(fields=("student", "date", "offering"), condition=Q(offering__isnull=False), name="unique_offering_attendance"),
        ]
        ordering = ("-date", "student__name")


class Grade(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="grades")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="grades")
    offering = models.ForeignKey(Offering, on_delete=models.CASCADE, related_name="grades")
    period = models.ForeignKey(AcademicPeriod, on_delete=models.PROTECT, related_name="grades")
    value = models.DecimalField(max_digits=5, decimal_places=2)
    note = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("student", "offering", "period"), name="unique_student_offering_period_grade")]


class Book(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="books")
    title = models.CharField(max_length=240)
    author = models.CharField(max_length=180)
    code = models.CharField(max_length=80)
    copies = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "code"), name="unique_book_code_school")]
        ordering = ("title",)


class Loan(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="loans")
    book = models.ForeignKey(Book, on_delete=models.PROTECT, related_name="loans")
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="loans")
    borrowed_at = models.DateTimeField(default=timezone.now)
    due_at = models.DateField()
    returned_at = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ("-borrowed_at",)


class LostItem(models.Model):
    class State(models.TextChoices):
        PUBLISHED = "published", "Publicado"
        CLAIMED = "claimed", "Reclamado"
        RETURNED = "returned", "Entregado"
        CLOSED = "closed", "Cerrado"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="lost_items")
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    place = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=16, choices=State.choices, default=State.PUBLISHED)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    created_at = models.DateField(default=timezone.localdate)


class Claim(models.Model):
    class State(models.TextChoices):
        PENDING = "pending", "Pendiente"
        RESOLVED = "resolved", "Resuelto"
        REJECTED = "rejected", "Rechazado"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="claims")
    item = models.ForeignKey(LostItem, on_delete=models.CASCADE, related_name="claims")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="claims")
    message = models.TextField(blank=True)
    created_at = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=16, choices=State.choices, default=State.PENDING)


class Notice(models.Model):
    class Audience(models.TextChoices):
        ALL = "all", "Todos"
        STUDENTS = "students", "Alumnos"
        GUARDIANS = "guardians", "Familias"
        TEACHERS = "teachers", "Docentes"
        STAFF = "staff", "Personal"

    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="notices")
    title = models.CharField(max_length=180)
    body = models.TextField()
    audience = models.CharField(max_length=16, choices=Audience.choices, default=Audience.ALL)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    created_at = models.DateField(default=timezone.localdate)

    class Meta:
        ordering = ("-id",)


class NoticeRead(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="notice_reads")
    notice = models.ForeignKey(Notice, on_delete=models.CASCADE, related_name="reads")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notice_reads")
    read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("school", "notice", "user"), name="unique_notice_read_per_user")]
        indexes = [models.Index(fields=("school", "user", "read_at"))]


class SchoolEvent(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    audience = models.CharField(max_length=16, choices=Notice.Audience.choices, default=Notice.Audience.ALL)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("starts_at", "id")


class SubscriptionPlan(models.TextChoices):
    BASIC = "basic", "Básico"
    PRO = "pro", "Pro"


class PlatformBillingSettings(models.Model):
    """Monthly subscription prices shared by schools on each plan."""

    basic_monthly_amount_ars = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    pro_monthly_amount_ars = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    onboarding_amount_ars = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)


class PlatformPriceChange(models.Model):
    plan = models.CharField(max_length=12, choices=SubscriptionPlan.choices, default=SubscriptionPlan.BASIC)
    monthly_amount_ars = models.DecimalField(max_digits=12, decimal_places=2)
    effective_on = models.DateField()
    notified_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("effective_on",)
        constraints = [models.UniqueConstraint(fields=("plan", "effective_on"), name="unique_plan_price_change_date")]


class SchoolSubscription(models.Model):
    class State(models.TextChoices):
        PENDING = "pending", "Alta pendiente de pago"
        ACTIVE = "active", "Activa"
        CANCELED = "canceled", "Cancelada"

    school = models.OneToOneField(School, on_delete=models.CASCADE, related_name="subscription")
    state = models.CharField(max_length=16, choices=State.choices, default=State.PENDING)
    plan = models.CharField(max_length=12, choices=SubscriptionPlan.choices, default=SubscriptionPlan.BASIC)
    pending_plan = models.CharField(max_length=12, choices=SubscriptionPlan.choices, null=True, blank=True)
    plan_change_effective_on = models.DateField(null=True, blank=True)
    monthly_amount_ars = models.DecimalField(max_digits=12, decimal_places=2)
    onboarding_amount_ars = models.DecimalField(max_digits=12, decimal_places=2)
    contact_name = models.CharField(max_length=180)
    contact_email = models.EmailField()
    activated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class SubscriptionCharge(models.Model):
    class Kind(models.TextChoices):
        ONBOARDING = "onboarding", "Alta y capacitación"
        MONTHLY = "monthly", "Abono mensual"

    class State(models.TextChoices):
        PENDING = "pending", "Pendiente"
        PAID = "paid", "Pagado"
        VOID = "void", "Anulado"

    subscription = models.ForeignKey(SchoolSubscription, on_delete=models.CASCADE, related_name="charges")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    plan = models.CharField(max_length=12, choices=SubscriptionPlan.choices, default=SubscriptionPlan.BASIC)
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    amount_ars = models.DecimalField(max_digits=12, decimal_places=2)
    due_on = models.DateField()
    state = models.CharField(max_length=12, choices=State.choices, default=State.PENDING)
    invoice_number = models.CharField(max_length=80, blank=True)
    transfer_reference = models.CharField(max_length=120, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("due_on", "id")
        constraints = [
            models.UniqueConstraint(fields=("subscription", "kind"), condition=Q(kind="onboarding"), name="unique_onboarding_charge"),
            models.UniqueConstraint(fields=("subscription", "kind", "period_start"), condition=Q(kind="monthly"), name="unique_monthly_charge_period"),
        ]


class Audit(models.Model):
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="audit_events")
    actor = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=80)
    detail = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-id",)


class ImportBatch(models.Model):
    class State(models.TextChoices):
        PREVIEW = "preview", "Vista previa"
        COMMITTED = "committed", "Importado"
        REJECTED = "rejected", "Rechazado"

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name="import_batches")
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    resource = models.CharField(max_length=24, default="students")
    rows = models.JSONField(default=list)
    errors = models.JSONField(default=list)
    state = models.CharField(max_length=16, choices=State.choices, default=State.PREVIEW)
    created_at = models.DateTimeField(auto_now_add=True)
