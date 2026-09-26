from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import (
    AcademicPeriod, AcademicPlan, Attendance, Audit, Book, Claim, Course,
    Enrollment, Grade, GradingScale, ImportBatch, LostItem, Loan, Membership,
    Notice, NoticeRead, Offering, PlanSubject, PlanYear, PlatformBillingSettings,
    PlatformPriceChange, School, SchoolEvent, SchoolSubscription, Section, Student,
    StudentGuardian, Subject, SubscriptionCharge, TeacherAssignment, User,
)

admin.site.site_header = "Nexo Escolar · Administración de plataforma"
admin.site.site_title = "Nexo Escolar"
admin.site.index_title = "Administración de escuelas y cuentas"


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "name", "is_active", "is_staff", "is_superuser")
    search_fields = ("email", "name")
    fieldsets = ((None, {"fields": ("email", "password")}),
                 ("Datos personales", {"fields": ("name", "first_name", "last_name")}),
                 ("Permisos", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")} ),
                 ("Fechas", {"fields": ("last_login", "date_joined")}))
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "name", "password1", "password2")}),)
    filter_horizontal = ("groups", "user_permissions")


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "school_type", "jurisdiction", "state", "created_at")
    list_filter = ("school_type", "state", "jurisdiction")
    search_fields = ("name", "slug", "jurisdiction")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("user", "school", "role", "is_active", "created_at")
    list_filter = ("role", "is_active", "school")
    search_fields = ("user__email", "user__name", "school__name")


for model in (Student, StudentGuardian, Course, Subject, AcademicPlan, PlanYear,
              PlanSubject, Section, Enrollment, AcademicPeriod, GradingScale,
              Offering, TeacherAssignment, Attendance, Grade, Book, Loan,
              LostItem, Claim, Notice, NoticeRead, SchoolEvent, Audit, ImportBatch,
              PlatformBillingSettings, PlatformPriceChange, SchoolSubscription,
              SubscriptionCharge):
    admin.site.register(model)
