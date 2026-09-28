(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const csrfToken = () => document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith("csrftoken="))?.split("=")[1] || "";
  const stateLabels = {onboarding:"Esperando pagos", trial:"En período piloto", active:"Activa", suspended:"Suspendida"};
  const planLabels = {basic:"Básico", pro:"Pro"};
  let schools = [];
  let charges = [];
  let signupRequests = [];
  let settings = null;
  let schoolFilter = "all";
  let schoolsLoaded = false;

  async function api(path, method = "GET", data) {
    const headers = {};
    if (data !== undefined) headers["Content-Type"] = "application/json";
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRFToken"] = csrfToken();
    const response = await fetch(`/api/v1${path.endsWith("/") ? path : `${path}/`}`, {
      method, headers, credentials: "same-origin", body: data === undefined ? undefined : JSON.stringify(data)
    });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok) throw new Error(result.error || "No se pudo completar la acción.");
    return result;
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(node.hideTimer);
    node.hideTimer = setTimeout(() => node.classList.remove("show"), 3500);
  }

  function schoolInitials(name) {
    return String(name || "N").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }

  function ars(value) {
    return new Intl.NumberFormat("es-AR", {style:"currency", currency:"ARS", maximumFractionDigits:2}).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "—";
    const [year, month, day] = String(value).split("-");
    return day ? `${day}/${month}/${year}` : `${month}/${year}`;
  }

  function updateMetrics() {
    const waiting = schools.filter(school => school.state === "onboarding").length;
    const active = schools.filter(school => ["active", "trial"].includes(school.state)).length;
    const suspended = schools.filter(school => school.state === "suspended").length;
    $("#metric-total").textContent = schools.length;
    $("#metric-trial").textContent = waiting;
    $("#metric-active").textContent = active;
    $("#filter-all-count").textContent = schools.length;
    $("#filter-onboarding-count").textContent = waiting;
    $("#filter-active-count").textContent = active;
    $("#filter-suspended-count").textContent = suspended;
  }

  function renderSchools() {
    const query = $("#school-search").value.trim().toLocaleLowerCase("es");
    const visible = schools.filter(school => {
      const matchesQuery = [school.name, school.slug, school.jurisdiction].join(" ").toLocaleLowerCase("es").includes(query);
      const matchesFilter = schoolFilter === "all" || (schoolFilter === "active" ? ["active", "trial"].includes(school.state) : school.state === schoolFilter);
      return matchesQuery && matchesFilter;
    });
    const list = $("#school-list");
    if (!visible.length) {
      const pricingReady = Number(settings?.basic_monthly_amount_ars || 0) > 0 && Number(settings?.onboarding_amount_ars || 0) > 0;
      list.innerHTML = schools.length
        ? '<div class="empty-state"><strong>No hay instituciones con esos filtros</strong><p>Probá con otro nombre o elegí otro estado.</p><button class="text-button" type="button" data-clear-school-filters>Ver todas</button></div>'
        : pricingReady
          ? '<div class="empty-state"><strong>Todavía no hay escuelas</strong><p>Los precios están listos. Ya podés registrar la primera escuela.</p><button class="primary-button" type="button" data-create-first-school>Crear escuela</button></div>'
          : '<div class="empty-state"><strong>Antes de empezar, definí los precios</strong><p>Configurá el abono mensual y el alta inicial para poder registrar una escuela.</p><button class="primary-button" type="button" data-switch-billing>Configurar precios</button></div>';
      list.querySelector("[data-clear-school-filters]")?.addEventListener("click", () => {
        $("#school-search").value = "";
        schoolFilter = "all";
        $(".filter-chip.active")?.classList.remove("active");
        document.querySelectorAll("[data-school-filter]").forEach(filter => {
          const active = filter.dataset.schoolFilter === "all";
          filter.classList.toggle("active", active);
          filter.setAttribute("aria-pressed", String(active));
        });
        renderSchools();
      });
      list.querySelector("[data-create-first-school]")?.addEventListener("click", openCreateSchool);
      list.querySelector("[data-switch-billing]")?.addEventListener("click", () => switchView("billing"));
      return;
    }
    list.innerHTML = `<div class="school-record-list">${visible.map(school => {
      const state = stateLabels[school.state] ? school.state : "suspended";
      const chargeLabel = school.overdue_charges ? `${school.overdue_charges} pagos vencidos` : school.pending_charges ? `${school.pending_charges} pagos pendientes` : school.subscription_state ? "Pagos al día" : "Sin cargos";
      const chargeClass = school.overdue_charges ? "overdue" : school.pending_charges ? "pending" : "";
      const planLabel = school.subscription_state ? (planLabels[school.plan] || "Plan sin definir") : "Sin suscripción";
      const planDetail = school.pending_plan ? `Cambio a ${planLabels[school.pending_plan] || "nuevo plan"} desde ${escapeHtml(formatDate(school.plan_change_effective_on))}` : "";
      const memberCount = Number(school.members) || 0;
      return `<article class="school-record"><div class="school-record-main"><span class="school-initial">${escapeHtml(schoolInitials(school.name))}</span><div class="school-record-identity"><div class="school-record-title"><h3>${escapeHtml(school.name)}</h3><span class="state-pill state-${state}">${stateLabels[state]}</span></div><p>${escapeHtml(school.school_type === "technical" ? "Secundaria técnica" : "Secundaria común")} <span>·</span> ${escapeHtml(school.jurisdiction || "Jurisdicción a definir")} <span>·</span> ${memberCount} ${memberCount === 1 ? "cuenta" : "cuentas"}</p><small>${escapeHtml(school.slug)}</small></div></div><div class="school-record-plan"><small>PLAN</small><strong>${escapeHtml(planLabel)}</strong>${planDetail ? `<span>${planDetail}</span>` : ""}</div><div class="school-record-billing"><small>ESTADO DE PAGO</small><span class="charge-state ${chargeClass}">${escapeHtml(chargeLabel)}</span></div><div class="school-record-action"><button class="action-button manage-button" type="button" data-manage-school="${school.id}">Gestionar <span aria-hidden="true">›</span></button></div></article>`;
    }).join("")}</div>`;
    list.querySelectorAll("[data-manage-school]").forEach(button => {
      button.addEventListener("click", () => openManageSchool(Number(button.dataset.manageSchool)));
    });
  }

  function openManageSchool(id) {
    const school = schools.find(row => Number(row.id) === id);
    if (!school) return;
    const state = stateLabels[school.state] ? school.state : "suspended";
    const targetPlan = school.plan === "pro" ? "basic" : "pro";
    const overdueText = school.overdue_charges ? `${school.overdue_charges} pago(s) vencido(s)` : school.pending_charges ? `${school.pending_charges} pago(s) pendiente(s)` : "Sin pagos pendientes";
    const statusDescription = state === "suspended" && school.subscription_state === "canceled"
      ? "La suscripción está cancelada. Reactivala en la sección de pagos para restablecer el acceso."
      : ({
      onboarding: "El acceso se habilita cuando se confirmen el alta y el primer abono.",
      trial: "La institución está en período piloto.",
      active: "La institución puede ingresar a Nexo Escolar. Si hace falta, podés reenviar la invitación a su responsable.",
      suspended: "La institución no puede ingresar mientras esté suspendida."
      }[state]);
    let accessActions = "";
    if (state === "onboarding") {
      accessActions = `<button class="secondary-button" type="button" data-switch-view="billing" data-scroll-target="charges-panel" data-charge-search="${escapeHtml(school.name)}">Revisar cobros iniciales</button>`;
    } else if (state === "trial") {
      accessActions = `<button class="primary-button" type="button" data-school-state="${school.id}" data-state="active">Activar acceso</button><button class="danger-button" type="button" data-school-state="${school.id}" data-state="suspended">Suspender acceso</button>`;
    } else if (state === "suspended" && (!school.subscription_state || school.subscription_state === "active")) {
      accessActions = `<button class="primary-button" type="button" data-school-state="${school.id}" data-state="active">Reactivar acceso</button>`;
    } else if (state === "suspended" && school.subscription_state === "canceled") {
      accessActions = '<span class="form-hint">El acceso se restablece al reactivar la suscripción.</span>';
    } else if (state === "active") {
      accessActions = `<button class="danger-button" type="button" data-school-state="${school.id}" data-state="suspended">Suspender acceso</button>${school.subscription_state === "active" ? `<button class="secondary-button" type="button" data-resend-invite="${school.id}">Reenviar invitación</button>` : ""}`;
    }

    let subscriptionContent = '<p class="manage-muted">Esta institución no tiene una suscripción.</p>';
    if (school.subscription_state) {
      const currentPlan = planLabels[school.plan] || "Plan sin definir";
      let planAction = "";
      if (school.subscription_state === "active" && state === "active") {
        if (school.pending_plan) {
          planAction = `<div class="scheduled-change"><span>Programado: ${currentPlan} → ${planLabels[school.pending_plan] || "nuevo plan"} desde ${escapeHtml(formatDate(school.plan_change_effective_on))}</span><button class="action-button" type="button" data-subscription-plan-id="${school.id}" data-plan="${school.plan}">Cancelar cambio</button></div>`;
        } else {
          const proUnavailable = targetPlan === "pro" && Number(settings?.pro_monthly_amount_ars || 0) <= 0;
          planAction = `<button class="secondary-button" type="button" data-subscription-plan-id="${school.id}" data-plan="${targetPlan}" ${proUnavailable ? "disabled title='Definí primero el precio del plan Pro en Cobros.'" : ""}>Cambiar a ${planLabels[targetPlan]}</button>${proUnavailable ? '<small class="form-hint">Definí primero el precio del plan Pro en Cobros.</small>' : ""}`;
        }
      }
      const cancelAction = ["pending", "active"].includes(school.subscription_state)
        ? `<button class="danger-button" type="button" data-cancel-subscription="${school.id}">Cancelar suscripción</button>` : "";
      if (school.subscription_state === "canceled") {
        subscriptionContent = `<div class="manage-plan-line"><span>Plan anterior</span><strong>${escapeHtml(currentPlan)}</strong></div><p class="manage-muted">La suscripción está cancelada. Si el alta ya se había completado, se restablecerá el acceso; si no, volverá a quedar pendiente de pago.</p><div class="manage-subscription-actions"><button class="primary-button" type="button" data-reactivate-subscription="${school.id}">Reactivar suscripción</button></div>`;
      } else {
        subscriptionContent = `<div class="manage-plan-line"><span>Plan actual</span><strong>${escapeHtml(currentPlan)}</strong></div><div class="manage-plan-line"><span>Estado de pago</span><strong>${escapeHtml(overdueText)}</strong></div><div class="manage-subscription-actions">${planAction}${cancelAction}</div>`;
      }
    }

    $("#modal-root").innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal-card manage-modal" role="dialog" aria-modal="true" aria-labelledby="manage-title"><div class="modal-header"><div><span class="eyebrow">INSTITUCIÓN</span><h2 id="manage-title">${escapeHtml(school.name)}</h2><p>${escapeHtml(school.slug)}</p></div><button class="close-modal" type="button" aria-label="Cerrar" data-close-modal>×</button></div><div class="manage-facts"><div><small>TIPO</small><b>${school.school_type === "technical" ? "Secundaria técnica" : "Secundaria común"}</b></div><div><small>JURISDICCIÓN</small><b>${escapeHtml(school.jurisdiction || "A definir")}</b></div><div><small>CUENTAS</small><b>${Number(school.members) || 0}</b></div></div><section class="manage-section"><div><h3>Acceso a la institución</h3><p>${statusDescription}</p></div><span class="state-pill state-${state}">${stateLabels[state]}</span></section><div class="manage-actions">${accessActions || '<span class="form-hint">No hay acciones de acceso disponibles.</span>'}</div><section class="manage-section manage-subscription"><div><h3>Suscripción y pagos</h3><p>Revisá el plan o gestioná los pagos de esta institución.</p></div></section><div class="manage-subscription-body">${subscriptionContent}</div><div class="modal-actions"><button class="secondary-button" type="button" data-close-modal>Listo</button></div></section></div>`;
    bindModal();
    const modal = $(".modal-card");
    modal.querySelectorAll("[data-school-state]").forEach(button => button.addEventListener("click", () => changeState(button.dataset.schoolState, button.dataset.state, button)));
    modal.querySelectorAll("[data-resend-invite]").forEach(button => button.addEventListener("click", () => resendSchoolInvite(button.dataset.resendInvite, button)));
    modal.querySelectorAll("[data-cancel-subscription]").forEach(button => button.addEventListener("click", () => cancelSubscription(button.dataset.cancelSubscription, button)));
    modal.querySelectorAll("[data-reactivate-subscription]").forEach(button => button.addEventListener("click", () => reactivateSubscription(button.dataset.reactivateSubscription, button)));
    modal.querySelectorAll("[data-subscription-plan-id]").forEach(button => button.addEventListener("click", () => changeSubscriptionPlan(button.dataset.subscriptionPlanId, button.dataset.plan, button)));
    modal.querySelector("[data-switch-view]")?.addEventListener("click", event => {
      const targetId = event.currentTarget.dataset.scrollTarget;
      const schoolName = event.currentTarget.dataset.chargeSearch;
      closeModal();
      switchView("billing");
      if (schoolName) {
        $("#charge-search").value = schoolName;
        renderCharges();
      }
      if (targetId) document.getElementById(targetId)?.scrollIntoView({behavior:"smooth", block:"start"});
    });
  }

  function renderCharges() {
    const list = $("#charge-list");
    const overdue = charges.filter(charge => charge.is_overdue).length;
    const pending = charges.filter(charge => charge.state === "pending" && !charge.is_overdue).length;
    const query = $("#charge-search").value.trim().toLocaleLowerCase("es");
    const visibleCharges = charges.filter(charge => [charge.school, charge.kind_label, charge.state_label, charge.plan_label, charge.invoice_number, charge.transfer_reference].join(" ").toLocaleLowerCase("es").includes(query));
    $("#charge-summary").textContent = `${pending} por cobrar · ${overdue} vencidos`;
    $("#charge-summary").classList.toggle("has-overdue", overdue > 0);
    if (!charges.length) {
      list.innerHTML = '<div class="empty-state billing-empty"><strong>Todavía no hay pagos para registrar</strong><p>Cuando generes los abonos, las transferencias pendientes van a aparecer acá.</p></div>';
      return;
    }
    if (!visibleCharges.length) {
      list.innerHTML = '<div class="empty-state billing-empty"><strong>No encontramos pagos de esa escuela</strong><p>Probá con otro nombre o limpiá la búsqueda.</p><button class="text-button" type="button" data-clear-charge-search>Ver todos los pagos</button></div>';
      list.querySelector("[data-clear-charge-search]").addEventListener("click", () => {
        $("#charge-search").value = "";
        renderCharges();
      });
      return;
    }
    list.innerHTML = `<table class="school-table"><thead><tr><th>INSTITUCIÓN</th><th>CONCEPTO</th><th>PERÍODO</th><th>IMPORTE</th><th>VENCIMIENTO</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>${visibleCharges.map(charge => {
      const stateClass = charge.state === "paid" ? "" : charge.is_overdue ? "overdue" : charge.state === "void" ? "void" : "pending";
      const stateLabel = charge.is_overdue ? "Vencido" : charge.state_label;
      const period = charge.period_start ? formatDate(charge.period_start.slice(0, 7)) : "—";
      const detail = charge.state === "paid"
        ? `<span class="charge-detail">${charge.invoice_number ? `Factura ${escapeHtml(charge.invoice_number)} · ` : ""}Transf. ${escapeHtml(charge.transfer_reference)}</span>` : "";
      const action = charge.state === "pending"
        ? `<button class="action-button" data-charge-id="${charge.id}">Registrar pago</button>` : "—";
      return `<tr><td><div class="school-name"><span><b>${escapeHtml(charge.school)}</b>${detail}</span></div></td><td>${escapeHtml(charge.kind_label)}${charge.kind === "monthly" ? `<small class="charge-detail">Plan ${escapeHtml(charge.plan_label || planLabels[charge.plan] || "Básico")}</small>` : ""}</td><td><span class="charge-period">${period}</span></td><td><span class="charge-amount">${ars(charge.amount_ars)}</span></td><td>${formatDate(charge.due_on)}</td><td><span class="charge-state ${stateClass}">${escapeHtml(stateLabel)}</span></td><td>${action}</td></tr>`;
    }).join("")}</tbody></table>`;
    list.querySelectorAll("[data-charge-id]").forEach(button => {
      button.addEventListener("click", () => openPaymentModal(Number(button.dataset.chargeId)));
    });
  }

  async function loadSchools() {
    const list = $("#school-list");
    schoolsLoaded = false;
    list.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando instituciones…</div>';
    try {
      schools = await api("/platform/schools/");
      schoolsLoaded = true;
      updateMetrics();
      renderSchools();
      const basicUsed = schools.some(school => school.subscription_state && (school.plan === "basic" || school.pending_plan === "basic"));
      const proUsed = schools.some(school => school.subscription_state && (school.plan === "pro" || school.pending_plan === "pro"));
      const hasSubscriptions = schools.some(school => school.subscription_state);
      $("#basic-monthly-amount").disabled = basicUsed;
      $("#pro-monthly-amount").disabled = proUsed;
      $("#onboarding-amount").disabled = hasSubscriptions;
      $("#save-pricing-button").disabled = basicUsed && proUsed && hasSubscriptions;
      const lockedPrices = [];
      if (basicUsed) lockedPrices.push("Básico");
      if (proUsed) lockedPrices.push("Pro");
      if (hasSubscriptions) lockedPrices.push("el alta inicial");
      $("#pricing-lock-note").textContent = lockedPrices.length
        ? `Precio protegido para ${lockedPrices.join(", ")}: ya está asignado a una institución.`
        : "Podés editar estos precios hasta asignarlos a una institución.";
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><strong>No se pudieron cargar las instituciones</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  function renderSignupRequests() {
    const list = $("#signup-request-list");
    const badge = $("#request-count");
    badge.hidden = !signupRequests.length;
    badge.textContent = signupRequests.length > 99 ? "99+" : String(signupRequests.length);
    if (!signupRequests.length) {
      list.innerHTML = '<div class="empty-state"><strong>No hay solicitudes para revisar</strong><p>Las solicitudes aparecen acá después de que el director verifica su correo.</p></div>';
      return;
    }
    list.innerHTML = signupRequests.map(item => {
      const digits = String(item.contact_phone || "").replace(/\D/g, "");
      const wa = /^\d{8,15}$/.test(digits) ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hola ${item.contact_name}, te contactamos desde Nexo por la solicitud ${item.id} para ${item.school_name}.`)}` : "";
      const waAction = wa ? `<a class="action-button" href="${wa}" target="_blank" rel="noopener">Contactar por WhatsApp ↗</a>` : "";
      const quoteAction = item.quote_expired
        ? `<button class="secondary-button" type="button" data-requote="${item.id}">Actualizar cotización</button>`
        : `<button class="primary-button" type="button" data-approve-signup="${item.id}">Aprobar para cobro</button>`;
      const quoteStatus = item.quote_expired
        ? '<span class="request-expired">Cotización vencida · confirmar importes por WhatsApp</span>'
        : `Cotización vigente hasta ${escapeHtml(new Date(item.quote_expires_at).toLocaleDateString("es-AR"))}`;
      return `<article class="signup-request-card"><div class="request-card-top"><div><span class="eyebrow">SOLICITUD ${escapeHtml(item.id.slice(0, 8).toUpperCase())}</span><h2>${escapeHtml(item.school_name)}</h2><p>${escapeHtml(item.school_type === "technical" ? "Secundaria técnica" : "Secundaria común")} · ${escapeHtml(item.jurisdiction || "Jurisdicción no indicada")}</p></div><span class="request-verified">Correo verificado</span></div><div class="request-details"><div><small>DIRECTOR/A</small><b>${escapeHtml(item.contact_name)}</b><span>${escapeHtml(item.contact_email)}</span><span>${escapeHtml(item.contact_phone)}</span></div><div><small>PLAN Y COTIZACIÓN</small><b>${escapeHtml(planLabels[item.plan] || item.plan)}</b><span>${ars(item.monthly_quote_ars)} al mes</span><span>Alta: ${ars(item.onboarding_quote_ars)} · Inicial: ${ars(item.initial_total_ars)}</span><span>${quoteStatus}</span></div></div><div class="request-actions">${waAction}${quoteAction}<button class="text-button danger-text" type="button" data-reject-signup="${item.id}">Rechazar</button></div></article>`;
    }).join("");
    list.querySelectorAll("[data-approve-signup]").forEach(button => button.addEventListener("click", () => approveSignup(button.dataset.approveSignup)));
    list.querySelectorAll("[data-reject-signup]").forEach(button => button.addEventListener("click", () => rejectSignup(button.dataset.rejectSignup)));
    list.querySelectorAll("[data-requote]").forEach(button => button.addEventListener("click", () => requoteSignup(button.dataset.requote)));
  }

  async function loadSignupRequests() {
    const list = $("#signup-request-list");
    list.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando solicitudes…</div>';
    try {
      signupRequests = await api("/platform/school-signups/");
      renderSignupRequests();
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><strong>No se pudieron cargar las solicitudes</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  async function approveSignup(id) {
    const item = signupRequests.find(row => row.id === id);
    if (!item || item.quote_expired) return;
    const approved = window.confirm(`¿Confirmaste la conversación por WhatsApp con ${item.contact_name}?\n\nAl aprobar se crearán ${item.school_name}, la suscripción pendiente y los cargos de alta y primer mes. La escuela tendrá acceso cuando Nexo registre ambos pagos en Cobros.`);
    if (!approved) return;
    try {
      const result = await api(`/platform/school-signups/${encodeURIComponent(id)}/approve/`, "POST", {});
      toast(`Solicitud aprobada. ${result.name} quedó esperando los dos pagos.`);
      await Promise.all([loadSignupRequests(), loadSchools(), loadBilling()]);
    } catch (error) { toast(error.message); }
  }

  async function rejectSignup(id) {
    const reason = window.prompt("Motivo del rechazo (opcional):", "");
    if (reason === null) return;
    try {
      await api(`/platform/school-signups/${encodeURIComponent(id)}/reject/`, "POST", {reason});
      toast("Solicitud rechazada.");
      await loadSignupRequests();
    } catch (error) { toast(error.message); }
  }

  async function requoteSignup(id) {
    const confirmed = window.confirm("¿Confirmaste por WhatsApp los precios actuales con el director? Se renovará la cotización por 7 días.");
    if (!confirmed) return;
    try {
      await api(`/platform/school-signups/${encodeURIComponent(id)}/requote/`, "POST", {whatsapp_confirmed:true});
      toast("Cotización actualizada por 7 días.");
      await loadSignupRequests();
    } catch (error) { toast(error.message); }
  }

  async function loadBilling() {
    try {
      [settings, charges] = await Promise.all([
        api("/platform/billing/settings/"), api("/platform/billing/charges/")
      ]);
      $("#basic-monthly-amount").value = settings.basic_monthly_amount_ars;
      $("#pro-monthly-amount").value = settings.pro_monthly_amount_ars;
      $("#onboarding-amount").value = settings.onboarding_amount_ars;
      renderCharges();
      if (schoolsLoaded && !schools.length) renderSchools();
      const prices = settings.price_changes || [];
      $("#scheduled-prices").innerHTML = prices.length
        ? prices.map(change => `<div class="scheduled-price">Desde ${escapeHtml(formatDate(change.effective_on))} · ${planLabels[change.plan] || "Básico"}: ${ars(change.monthly_amount_ars)} al mes ${change.notified_at ? "· aviso enviado" : "· aviso pendiente"}</div>`).join("")
        : '<span>No hay ajustes programados.</span>';
    } catch (error) {
      $("#charge-list").innerHTML = `<div class="empty-state"><strong>No se pudieron cargar los cobros</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  async function changeState(id, state, button) {
    if (state === "suspended" && !window.confirm("¿Suspender el acceso de esta institución?")) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      await api(`/schools/${encodeURIComponent(id)}/state/`, "PATCH", {state});
      toast(state === "suspended" ? "Institución suspendida." : "Institución reactivada.");
      closeModal();
      await loadSchools();
    } catch (error) {
      button.disabled = false;
      button.textContent = original;
      toast(error.message);
    }
  }

  async function cancelSubscription(id, button) {
    if (!window.confirm("¿Cancelar la suscripción y suspender el acceso de esta escuela?")) return;
    button.disabled = true;
    try {
      await api(`/platform/schools/${encodeURIComponent(id)}/subscription/`, "PATCH", {state:"canceled"});
      toast("Suscripción cancelada, acceso suspendido y aviso enviado al correo de administración.");
      closeModal();
      await Promise.all([loadSchools(), loadBilling()]);
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  }

  async function reactivateSubscription(id, button) {
    if (!window.confirm("¿Reactivar la suscripción? Si el alta ya se había completado, se restablecerá el acceso y se generará el abono del mes actual si falta. Si no, volverá a quedar pendiente de pago.")) return;
    button.disabled = true;
    button.textContent = "Reactivando…";
    try {
      const result = await api(`/platform/schools/${encodeURIComponent(id)}/subscription/`, "PATCH", {state:"active"});
      toast(!result.access_enabled
        ? "Alta reabierta y aviso enviado. El acceso sigue pendiente de los pagos iniciales."
        : result.monthly_charge_created
          ? "Suscripción reactivada, aviso enviado y abono del mes actual generado."
          : "Suscripción reactivada, acceso restablecido y aviso enviado.");
      closeModal();
      await Promise.all([loadSchools(), loadBilling()]);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Reactivar suscripción";
      toast(error.message);
    }
  }

  async function changeSubscriptionPlan(id, plan, button) {
    button.disabled = true;
    try {
      const result = await api(`/platform/schools/${encodeURIComponent(id)}/subscription/`, "PATCH", {plan});
      toast(result.pending_plan
        ? `Cambio a ${planLabels[result.pending_plan]} programado para el ${formatDate(result.plan_change_effective_on)}.`
        : "Cambio programado cancelado; se mantiene el plan actual.");
      closeModal();
      await loadSchools();
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  }

  async function resendSchoolInvite(id, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
      await api(`/platform/schools/${encodeURIComponent(id)}/invite/`, "POST", {});
      toast("Invitación reenviada al correo de administración de la escuela.");
      button.textContent = original;
      button.disabled = false;
    } catch (error) {
      button.textContent = original;
      button.disabled = false;
      toast(error.message);
    }
  }

  function switchView(viewName, updateHistory = true) {
    const views = {
      requests: {section: "requests-section", nav: "requests-nav"},
      institutions: {section: "institutions-section", nav: "institutions-nav"},
      billing: {section: "billing-section", nav: "billing-nav"}
    };
    const selected = views[viewName] || views.institutions;
    Object.values(views).forEach(view => {
      const section = document.getElementById(view.section);
      const nav = document.getElementById(view.nav);
      const active = view === selected;
      section.hidden = !active;
      nav.classList.toggle("active", active);
      if (active) nav.setAttribute("aria-current", "page");
      else nav.removeAttribute("aria-current");
    });
    if (updateHistory && window.location.hash !== `#${selected.section}`) {
      window.history.pushState(null, "", `#${selected.section}`);
    }
    window.scrollTo(0, 0);
  }

  function closeModal() { $("#modal-root").replaceChildren(); }

  function bindModal() {
    const modal = $(".modal-card");
    modal.querySelectorAll("[data-close-modal]").forEach(control => control.addEventListener("click", event => {
      if (event.target === control || control === event.currentTarget) closeModal();
    }));
    $("#modal-root .modal-backdrop").addEventListener("click", event => {
      if (event.target === event.currentTarget) closeModal();
    });
  }

  function openCreateSchool() {
    if (!settings) {
      toast("Cargando la configuración de cobros. Intentá de nuevo en un momento.");
      return;
    }
    if (Number(settings.basic_monthly_amount_ars || 0) <= 0 || Number(settings.onboarding_amount_ars || 0) <= 0) {
      switchView("billing");
      toast("Antes de crear una institución, definí el abono Básico y el alta inicial.");
      return;
    }
    const proConfigured = Number(settings?.pro_monthly_amount_ars || 0) > 0;
    $("#modal-root").innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">Nueva escuela</h2><p>Al confirmar los dos pagos, se activa la escuela y se envía una invitación al correo de administración.</p></div><button class="close-modal" type="button" aria-label="Cerrar" data-close-modal>×</button></div><form class="school-form" id="school-form"><label>Nombre de la escuela<input name="name" required maxlength="180" placeholder="Ej. Escuela Secundaria del Centro"></label><div class="form-grid"><label>Identificador URL<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="80" placeholder="escuela-del-centro"><span class="form-hint">Minúsculas, números y guiones.</span></label><label>Tipo de secundaria<select name="school_type" required><option value="common">Secundaria común</option><option value="technical">Secundaria técnica</option></select></label></div><label>Plan<select name="plan" required><option value="basic">Básico · ${ars(settings?.basic_monthly_amount_ars)}/mes</option><option value="pro" ${proConfigured ? "" : "disabled"}>Pro · ${proConfigured ? `${ars(settings.pro_monthly_amount_ars)}/mes` : "tarifa sin configurar"}</option></select></label><label>Provincia / jurisdicción<input name="jurisdiction" maxlength="120" placeholder="A definir"></label><div class="form-grid"><label>Nombre de administración escolar<input name="admin_name" required maxlength="180" placeholder="Nombre y apellido"></label><label>Correo de administración escolar<input name="admin_email" required type="email" placeholder="admin@escuela.edu.ar"></label></div><div class="form-hint">Se crearán dos pagos iniciales: alta y primer mes. La escuela podrá ingresar cuando ambos estén confirmados.</div><div class="modal-actions"><button class="secondary-button" type="button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">Crear escuela</button></div></form></section></div>`;
    bindModal();
    $("#school-form").addEventListener("submit", submitSchoolForm);
    $("#school-form [name=name]").focus();
  }

  async function submitSchoolForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach(key => { data[key] = data[key].trim(); });
    submit.disabled = true;
    submit.textContent = "Guardando…";
    try {
      const result = await api("/platform/schools/", "POST", data);
      closeModal();
      toast(`Escuela creada. Se generaron ${result.initial_charges.length} pagos iniciales.`);
      await Promise.all([loadSchools(), loadBilling()]);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Crear escuela";
      toast(error.message);
    }
  }

  function openPaymentModal(chargeId) {
    const charge = charges.find(row => row.id === chargeId);
    if (!charge) return;
    $("#modal-root").innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="payment-title"><div class="modal-header"><div><h2 id="payment-title">Registrar transferencia</h2><p>${escapeHtml(charge.school)} · ${escapeHtml(charge.kind_label)} · ${ars(charge.amount_ars)}</p></div><button class="close-modal" type="button" aria-label="Cerrar" data-close-modal>×</button></div><form class="school-form" id="payment-form"><label>Referencia de transferencia<input name="transfer_reference" required maxlength="120" placeholder="Código o identificador del banco"></label><label>Número de factura emitida fuera de Nexo<input name="invoice_number" maxlength="80" placeholder="Opcional"></label><div class="modal-actions"><button class="secondary-button" type="button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">Confirmar pago</button></div></form></section></div>`;
    bindModal();
    $("#payment-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const result = await api(`/platform/billing/charges/${chargeId}/`, "PATCH", {
          state: "paid", transfer_reference: event.currentTarget.elements.transfer_reference.value.trim(),
          invoice_number: event.currentTarget.elements.invoice_number.value.trim()
        });
        closeModal();
        toast(result.school_activated ? "Pago confirmado. Escuela activada e invitación enviada." : "Pago confirmado.");
        await Promise.all([loadSchools(), loadBilling()]);
      } catch (error) {
        button.disabled = false;
        toast(error.message);
      }
    });
  }

  async function savePricing(event) {
    event.preventDefault();
    try {
      await api("/platform/billing/settings/", "PATCH", {
        basic_monthly_amount_ars: $("#basic-monthly-amount").value,
        pro_monthly_amount_ars: $("#pro-monthly-amount").value,
        onboarding_amount_ars: $("#onboarding-amount").value
      });
      toast("Precios guardados.");
      await loadBilling();
    } catch (error) { toast(error.message); }
  }

  async function schedulePriceChange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.effective_on = `${data.effective_on}-01`;
      const result = await api("/platform/billing/price-changes/", "POST", data);
      toast(`Nuevo precio ${planLabels[result.plan]} programado. Se avisó a ${result.notifications_sent} escuela(s).`);
      form.reset();
      form.elements.effective_on.value = firstNoticeableMonthValue;
      await loadBilling();
    } catch (error) { toast(error.message); }
  }

  async function generateCharges(event) {
    event.preventDefault();
    try {
      const result = await api("/platform/billing/charges/", "POST", {month: $("#charge-month").value});
      toast(`${result.created} abonos generados; ${result.existing} ya existían.`);
      await loadBilling();
    } catch (error) { toast(error.message); }
  }

  async function logout() {
    const button = $("#logout-button");
    button.disabled = true;
    try { await api("/auth/logout/", "POST", {}); }
    catch (error) { toast(error.message); button.disabled = false; return; }
    window.location.assign("/");
  }

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  $("#current-year").textContent = new Date().getFullYear();
  $("#charge-month").value = currentMonth;
  $("#charge-month").min = currentMonth;
  $("#charge-month").max = currentMonth;
  const firstNoticeableMonth = new Date();
  firstNoticeableMonth.setDate(1);
  firstNoticeableMonth.setMonth(firstNoticeableMonth.getMonth() + 2);
  const firstNoticeableMonthValue = `${firstNoticeableMonth.getFullYear()}-${String(firstNoticeableMonth.getMonth() + 1).padStart(2, "0")}`;
  $("#price-change-form [name=effective_on]").value = firstNoticeableMonthValue;
  $("#price-change-form [name=effective_on]").min = firstNoticeableMonthValue;
  $("#create-school-button").addEventListener("click", openCreateSchool);
  $("#school-search").addEventListener("input", renderSchools);
  $("#charge-search").addEventListener("input", renderCharges);
  document.querySelectorAll("[data-school-filter]").forEach(button => button.addEventListener("click", () => {
    schoolFilter = button.dataset.schoolFilter;
    document.querySelectorAll("[data-school-filter]").forEach(filter => {
      const active = filter === button;
      filter.classList.toggle("active", active);
      filter.setAttribute("aria-pressed", String(active));
    });
    renderSchools();
  }));
  $("#logout-button").addEventListener("click", logout);
  $("#billing-settings-form").addEventListener("submit", savePricing);
  $("#price-change-form").addEventListener("submit", schedulePriceChange);
  $("#generate-charges-form").addEventListener("submit", generateCharges);
  $("#billing-nav").addEventListener("click", event => { event.preventDefault(); switchView("billing"); });
  $("#requests-nav").addEventListener("click", event => { event.preventDefault(); switchView("requests"); });
  $("#institutions-nav").addEventListener("click", event => { event.preventDefault(); switchView("institutions"); });
  $("#refresh-requests").addEventListener("click", loadSignupRequests);
  window.addEventListener("hashchange", () => {
    const section = window.location.hash;
    switchView(section === "#billing-section" ? "billing" : section === "#requests-section" ? "requests" : "institutions", false);
  });
  if (window.location.hash === "#billing-section") switchView("billing", false);
  else if (window.location.hash === "#requests-section") switchView("requests", false);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
  Promise.all([loadSchools(), loadBilling(), loadSignupRequests()]);
})();
