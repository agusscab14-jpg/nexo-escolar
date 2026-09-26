(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
  const csrfToken = () => document.cookie.split(";").map(item => item.trim()).find(item => item.startsWith("csrftoken="))?.split("=")[1] || "";
  const stateLabels = {onboarding:"Alta pendiente", trial:"En período piloto", active:"Activa", suspended:"Suspendida"};
  const planLabels = {basic:"Básico", pro:"Pro"};
  let schools = [];
  let charges = [];
  let settings = null;

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

  function updateMetrics() {
    $("#metric-total").textContent = schools.length;
    $("#metric-trial").textContent = schools.filter(school => school.state === "onboarding").length;
    $("#metric-active").textContent = schools.filter(school => school.state === "active").length;
  }

  function renderSchools() {
    const query = $("#school-search").value.trim().toLocaleLowerCase("es");
    const visible = schools.filter(school => [school.name, school.slug, school.jurisdiction].join(" ").toLocaleLowerCase("es").includes(query));
    const list = $("#school-list");
    if (!visible.length) {
      list.innerHTML = schools.length
        ? '<div class="empty-state"><strong>No encontramos instituciones</strong><p>Probá con otro nombre o jurisdicción.</p></div>'
        : '<div class="empty-state"><strong>Todavía no hay instituciones</strong><p>Configurá la tarifa en Cobros para registrar la primera alta paga.</p></div>';
      return;
    }
    list.innerHTML = `<table class="school-table"><thead><tr><th>INSTITUCIÓN</th><th>TIPO</th><th>JURISDICCIÓN</th><th>CUENTAS</th><th>ESTADO</th><th>PLAN</th><th>ABONOS</th><th><span class="visually-hidden">ACCIONES</span></th></tr></thead><tbody>${visible.map(school => {
      const state = stateLabels[school.state] ? school.state : "suspended";
      let statusAction = "";
      if (state === "onboarding") statusAction = `<a class="action-button" href="#billing-section">Ver cargos</a>`;
      else if (state === "suspended") {
        if (!school.subscription_state || school.subscription_state === "active") statusAction = `<button class="action-button" data-school-state="${school.id}" data-state="active">Reactivar</button>`;
      } else if (state === "trial") statusAction = `<button class="action-button" data-school-state="${school.id}" data-state="active">Activar</button><button class="action-button danger" data-school-state="${school.id}" data-state="suspended">Suspender</button>`;
      else statusAction = `<button class="action-button danger" data-school-state="${school.id}" data-state="suspended">Suspender</button>`;
      if (["pending", "active"].includes(school.subscription_state)) statusAction += `<button class="action-button danger" data-cancel-subscription="${school.id}">Cancelar abono</button>`;
      const planLabel = planLabels[school.plan] || "—";
      const targetPlan = school.plan === "pro" ? "basic" : "pro";
      const planControl = school.plan && school.subscription_state === "active" && state === "active"
        ? school.pending_plan
          ? `<small class="scheduled-plan">${planLabels[school.plan]} → ${planLabels[school.pending_plan]} desde ${escapeHtml(school.plan_change_effective_on || "")}</small><button class="action-button" data-subscription-plan-id="${school.id}" data-plan="${school.plan}">Cancelar cambio</button>`
          : `<button class="action-button" data-subscription-plan-id="${school.id}" data-plan="${targetPlan}">Cambiar a ${planLabels[targetPlan]}</button>`
        : school.pending_plan ? `<small class="scheduled-plan">${planLabels[school.pending_plan]} programado</small>` : "";
      const chargeLabel = school.overdue_charges ? `${school.overdue_charges} vencido(s)` : school.pending_charges ? `${school.pending_charges} pendiente(s)` : "Al día";
      return `<tr><td><div class="school-name"><span class="school-initial">${escapeHtml(schoolInitials(school.name))}</span><span><b>${escapeHtml(school.name)}</b><small>${escapeHtml(school.slug)}</small></span></div></td><td><span class="type-label">${school.school_type === "technical" ? "Secundaria técnica" : "Secundaria común"}</span></td><td>${escapeHtml(school.jurisdiction || "A definir")}</td><td><span class="member-count">${Number(school.members) || 0}</span></td><td><span class="state-pill state-${state}">${stateLabels[state]}</span></td><td>${school.subscription_state ? `<span class="type-label">${planLabel}</span>${planControl}` : "—"}</td><td>${school.subscription_state ? `<span class="charge-state ${school.overdue_charges ? "overdue" : "pending"}">${chargeLabel}</span>` : "—"}</td><td><div class="row-actions">${statusAction}</div></td></tr>`;
    }).join("")}</tbody></table>`;
    list.querySelectorAll("[data-school-state]").forEach(button => {
      button.addEventListener("click", () => changeState(button.dataset.schoolState, button.dataset.state, button));
    });
    list.querySelectorAll("[data-cancel-subscription]").forEach(button => {
      button.addEventListener("click", () => cancelSubscription(button.dataset.cancelSubscription, button));
    });
    list.querySelectorAll("[data-subscription-plan-id]").forEach(button => {
      button.addEventListener("click", () => changeSubscriptionPlan(button.dataset.subscriptionPlanId, button.dataset.plan, button));
    });
  }

  function renderCharges() {
    const list = $("#charge-list");
    const overdue = charges.filter(charge => charge.is_overdue).length;
    const pending = charges.filter(charge => charge.state === "pending").length;
    $("#charge-summary").textContent = `${pending} pendiente(s) · ${overdue} vencido(s)`;
    if (!charges.length) {
      list.innerHTML = '<div class="empty-state billing-empty"><strong>Todavía no hay cargos</strong><p>Configurá la tarifa y registrá una institución.</p></div>';
      return;
    }
    list.innerHTML = `<table class="school-table"><thead><tr><th>INSTITUCIÓN</th><th>CONCEPTO</th><th>PERÍODO</th><th>IMPORTE</th><th>VENCIMIENTO</th><th>ESTADO</th><th>ACCIÓN</th></tr></thead><tbody>${charges.map(charge => {
      const stateClass = charge.state === "paid" ? "" : charge.is_overdue ? "overdue" : charge.state === "void" ? "void" : "pending";
      const stateLabel = charge.is_overdue ? "Vencido" : charge.state_label;
      const period = charge.period_start ? charge.period_start.slice(0, 7) : "—";
      const detail = charge.state === "paid"
        ? `<span class="charge-detail">${charge.invoice_number ? `Factura ${escapeHtml(charge.invoice_number)} · ` : ""}Transf. ${escapeHtml(charge.transfer_reference)}</span>` : "";
      const action = charge.state === "pending"
        ? `<button class="action-button" data-charge-id="${charge.id}">Registrar pago</button>` : "—";
      return `<tr><td><div class="school-name"><span><b>${escapeHtml(charge.school)}</b>${detail}</span></div></td><td>${escapeHtml(charge.kind_label)}${charge.kind === "monthly" ? `<small class="charge-detail">Plan ${escapeHtml(charge.plan_label || planLabels[charge.plan] || "Básico")}</small>` : ""}</td><td><span class="charge-period">${period}</span></td><td><span class="charge-amount">${ars(charge.amount_ars)}</span></td><td>${escapeHtml(charge.due_on)}</td><td><span class="charge-state ${stateClass}">${escapeHtml(stateLabel)}</span></td><td>${action}</td></tr>`;
    }).join("")}</tbody></table>`;
    list.querySelectorAll("[data-charge-id]").forEach(button => {
      button.addEventListener("click", () => openPaymentModal(Number(button.dataset.chargeId)));
    });
  }

  async function loadSchools() {
    const list = $("#school-list");
    list.innerHTML = '<div class="loading-state"><span class="spinner"></span> Cargando instituciones…</div>';
    try {
      schools = await api("/platform/schools/");
      updateMetrics();
      renderSchools();
      const basicUsed = schools.some(school => school.subscription_state && (school.plan === "basic" || school.pending_plan === "basic"));
      const proUsed = schools.some(school => school.subscription_state && (school.plan === "pro" || school.pending_plan === "pro"));
      const hasSubscriptions = schools.some(school => school.subscription_state);
      $("#basic-monthly-amount").disabled = basicUsed;
      $("#pro-monthly-amount").disabled = proUsed;
      $("#onboarding-amount").disabled = hasSubscriptions;
      $("#save-pricing-button").disabled = basicUsed && proUsed && hasSubscriptions;
      $("#pricing-lock-note").textContent = "Las tarifas de planes contratados y el alta registrada quedan protegidas; todavía podés definir el precio de un plan sin escuelas.";
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><strong>No se pudieron cargar las instituciones</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
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
      const prices = settings.price_changes || [];
      $("#scheduled-prices").innerHTML = prices.length
        ? prices.map(change => `<div class="scheduled-price">${escapeHtml(change.effective_on)} · ${planLabels[change.plan] || "Básico"}: ${ars(change.monthly_amount_ars)} al mes ${change.notified_at ? "· aviso enviado" : "· revisar aviso"}</div>`).join("")
        : '<span>No hay ajustes programados.</span>';
    } catch (error) {
      $("#charge-list").innerHTML = `<div class="empty-state"><strong>No se pudieron cargar los cobros</strong><p>${escapeHtml(error.message)}</p></div>`;
    }
  }

  async function changeState(id, state, button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      await api(`/schools/${encodeURIComponent(id)}/state/`, "PATCH", {state});
      toast(state === "suspended" ? "Institución suspendida." : "Institución reactivada.");
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
      toast("Suscripción cancelada; la escuela quedó suspendida.");
      await Promise.all([loadSchools(), loadBilling()]);
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  }

  async function changeSubscriptionPlan(id, plan, button) {
    button.disabled = true;
    try {
      const result = await api(`/platform/schools/${encodeURIComponent(id)}/subscription/`, "PATCH", {plan});
      toast(result.pending_plan
        ? `Cambio a ${planLabels[result.pending_plan]} programado para ${result.plan_change_effective_on}.`
        : "Cambio programado cancelado; se mantiene el plan actual.");
      await loadSchools();
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
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
    const proConfigured = Number(settings?.pro_monthly_amount_ars || 0) > 0;
    $("#modal-root").innerHTML = `<div class="modal-backdrop" data-close-modal><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">Alta de institución</h2><p>La invitación se envía cuando se confirmen el alta y el primer abono.</p></div><button class="close-modal" type="button" aria-label="Cerrar" data-close-modal>×</button></div><form class="school-form" id="school-form"><label>Nombre de la escuela<input name="name" required maxlength="180" placeholder="Ej. Escuela Secundaria del Centro"></label><div class="form-grid"><label>Identificador URL<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="80" placeholder="escuela-del-centro"><span class="form-hint">Minúsculas, números y guiones.</span></label><label>Tipo de secundaria<select name="school_type" required><option value="common">Secundaria común</option><option value="technical">Secundaria técnica</option></select></label></div><label>Plan<select name="plan" required><option value="basic">Básico · ${ars(settings?.basic_monthly_amount_ars)}/mes</option><option value="pro" ${proConfigured ? "" : "disabled"}>Pro · ${proConfigured ? `${ars(settings.pro_monthly_amount_ars)}/mes` : "tarifa sin configurar"}</option></select></label><label>Provincia / jurisdicción<input name="jurisdiction" maxlength="120" placeholder="A definir"></label><div class="form-grid"><label>Nombre de administración escolar<input name="admin_name" required maxlength="180" placeholder="Nombre y apellido"></label><label>Correo de administración escolar<input name="admin_email" required type="email" placeholder="admin@escuela.edu.ar"></label></div><div class="form-hint">Se generarán dos cargos: alta y capacitación, y primer mes del plan elegido. La escuela no podrá entrar hasta confirmar ambos pagos.</div><div class="modal-actions"><button class="secondary-button" type="button" data-close-modal>Cancelar</button><button class="primary-button" type="submit">Crear alta pendiente</button></div></form></section></div>`;
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
      toast(`Alta pendiente: se generaron ${result.initial_charges.length} cargos.`);
      await Promise.all([loadSchools(), loadBilling()]);
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Crear alta pendiente";
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
      toast("Tarifa guardada.");
      await loadBilling();
    } catch (error) { toast(error.message); }
  }

  async function schedulePriceChange(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const result = await api("/platform/billing/price-changes/", "POST", data);
      toast(`Ajuste ${planLabels[result.plan]} programado. Avisos enviados: ${result.notifications_sent}.`);
      form.reset();
      await loadBilling();
    } catch (error) { toast(error.message); }
  }

  async function generateCharges(event) {
    event.preventDefault();
    try {
      const result = await api("/platform/billing/charges/", "POST", {month: $("#charge-month").value});
      toast(`${result.created} cargos nuevos; ${result.existing} ya existían.`);
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
  const firstNoticeableMonth = new Date();
  firstNoticeableMonth.setDate(1);
  firstNoticeableMonth.setMonth(firstNoticeableMonth.getMonth() + 2);
  $("#price-change-form [name=effective_on]").value = `${firstNoticeableMonth.getFullYear()}-${String(firstNoticeableMonth.getMonth() + 1).padStart(2, "0")}-01`;
  $("#create-school-button").addEventListener("click", openCreateSchool);
  $("#school-search").addEventListener("input", renderSchools);
  $("#logout-button").addEventListener("click", logout);
  $("#billing-settings-form").addEventListener("submit", savePricing);
  $("#price-change-form").addEventListener("submit", schedulePriceChange);
  $("#generate-charges-form").addEventListener("submit", generateCharges);
  $("#billing-nav").addEventListener("click", () => {
    $("#institutions-nav").classList.remove("active");
    $("#billing-nav").classList.add("active");
  });
  $("#institutions-nav").addEventListener("click", () => {
    $("#billing-nav").classList.remove("active");
    $("#institutions-nav").classList.add("active");
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
  Promise.all([loadSchools(), loadBilling()]);
})();
