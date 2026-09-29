const roleNames={school_admin:"Administración escolar",directivo:"Directivo",secretaria:"Secretaría",preceptor:"Preceptoría",docente:"Docente",biblioteca:"Biblioteca",alumno:"Alumno",tutor:"Tutor"};
const icons={Inicio:"◫",Alumnos:"♧",Asistencia:"✓",Calificaciones:"✳",Boletines:"▤",Biblioteca:"▣","Objetos perdidos":"⌕",Avisos:"◉",Configuración:"⚙",Actividad:"↗","Plan de estudios":"▧","Estadísticas":"▥","Centro de ayuda":"?"};
const schoolThemeOptions=[
  {value:"forest",label:"Bosque",description:"Verde sereno e institucional"},
  {value:"ocean",label:"Océano",description:"Azules claros y profundos"},
  {value:"violet",label:"Violeta",description:"Violetas suaves y elegantes"},
  {value:"terracotta",label:"Terracota",description:"Tonos cálidos y naturales"}
];
const permissions={school_admin:["Inicio","Alumnos","Asistencia","Calificaciones","Boletines","Biblioteca","Objetos perdidos","Avisos","Plan de estudios","Configuración","Actividad"],directivo:["Inicio","Alumnos","Asistencia","Calificaciones","Boletines","Biblioteca","Objetos perdidos","Avisos","Plan de estudios","Configuración","Actividad"],secretaria:["Inicio","Alumnos","Asistencia","Objetos perdidos","Avisos"],preceptor:["Inicio","Alumnos","Asistencia","Objetos perdidos","Avisos"],docente:["Inicio","Calificaciones","Boletines"],biblioteca:["Inicio","Biblioteca"],alumno:["Inicio","Boletines","Biblioteca","Objetos perdidos","Avisos"],tutor:["Inicio","Boletines","Avisos"]};
Object.values(permissions).forEach(items=>items.splice(1,0,"Calendario"));
icons.Calendario="▦";
let me=null, page="Inicio", cache={}, searchTerm="", darkMode=false, themeTransitionTimer=null;
let reportCardStudentId=null, reportCardYear=null;
let analyticsFilters={};
const staticRoot=new URL("../",document.currentScript?.src||`${location.origin}/static/js/app.js`).href;
const $=s=>document.querySelector(s), h=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function csrfToken(){return document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("csrftoken="))?.split("=")[1]||""}
function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
const today=()=>new Date().toISOString().slice(0,10);
const DEFAULT_TEXT_ADJUSTMENT=1.2, MIN_TEXT_ADJUSTMENT=0, MAX_TEXT_ADJUSTMENT=3.2, TEXT_ADJUSTMENT_STEP=.4;
let textAdjustment=DEFAULT_TEXT_ADJUSTMENT;
function textAdjustmentKey(){return `nexo:text-adjustment:v1:${me?.id||"guest"}`}
function setTextAdjustment(value,persist=true){const number=Number(value);textAdjustment=Math.round(Math.max(MIN_TEXT_ADJUSTMENT,Math.min(MAX_TEXT_ADJUSTMENT,Number.isFinite(number)?number:DEFAULT_TEXT_ADJUSTMENT))*10)/10;document.documentElement.style.setProperty("--nexo-font-adjust",`${textAdjustment}px`);if(persist&&me?.id)try{localStorage.setItem(textAdjustmentKey(),String(textAdjustment))}catch{}const controls=document.querySelector(".text-size-controls");if(controls)controls.setAttribute("aria-label",`Tamaño del texto; ajuste adicional de ${textAdjustment} píxeles`)}
function loadTextAdjustment(){let value=DEFAULT_TEXT_ADJUSTMENT;if(me?.id)try{const saved=localStorage.getItem(textAdjustmentKey());if(saved!==null)value=Number(saved)}catch{}setTextAdjustment(value,false)}
function textSizeControls(){return `<div class="text-size-controls" role="group" aria-label="Tamaño del texto"><button type="button" data-text-size="decrease" aria-label="Disminuir tamaño del texto" title="Disminuir texto">A−</button><button type="button" class="text-size-reset" data-text-size="reset" aria-label="Restablecer el tamaño recomendado" title="Restablecer tamaño recomendado">A</button><button type="button" data-text-size="increase" aria-label="Aumentar tamaño del texto" title="Aumentar texto">A+</button></div>`}
function darkModeKey(){return `nexo:dark-mode:v1:${me?.id||"guest"}`}
function beginThemeTransition(){const root=document.documentElement;root.classList.add("theme-transitioning");if(themeTransitionTimer)clearTimeout(themeTransitionTimer);themeTransitionTimer=setTimeout(()=>root.classList.remove("theme-transitioning"),280)}
function setDarkMode(enabled,persist=true){darkMode=Boolean(enabled);const root=document.documentElement;if(persist)beginThemeTransition();root.dataset.theme=darkMode?"dark":"light";if(persist&&me?.id)try{localStorage.setItem(darkModeKey(),darkMode?"dark":"light")}catch{}const button=document.querySelector("[data-theme-toggle]");if(button){button.textContent=darkMode?"☀":"☾";button.setAttribute("aria-label",darkMode?"Activar modo claro":"Activar modo oscuro");button.title=darkMode?"Activar modo claro":"Activar modo oscuro";if(persist){button.classList.remove("theme-icon-change");void button.offsetWidth;button.classList.add("theme-icon-change");setTimeout(()=>button.classList.remove("theme-icon-change"),320)}}}
function loadDarkMode(){let saved="light";if(me?.id)try{saved=localStorage.getItem(darkModeKey())||"light"}catch{}setDarkMode(saved==="dark",false)}
function setSchoolTheme(theme,animate=true){const allowed=schoolThemeOptions.some(option=>option.value===theme);if(animate)beginThemeTransition();document.documentElement.dataset.schoolTheme=allowed?theme:"forest"}
function loadSchoolTheme(){setSchoolTheme(me?.school_theme||"forest",false)}
function themeToggleControl(){return `<button class="theme-toggle" type="button" data-theme-toggle aria-label="${darkMode?"Activar modo claro":"Activar modo oscuro"}" title="${darkMode?"Activar modo claro":"Activar modo oscuro"}">${darkMode?"☀":"☾"}</button>`}
document.addEventListener("click",event=>{const target=event.target;const themeToggle=target.closest?.("[data-theme-toggle]");if(themeToggle){setDarkMode(!darkMode);return}const control=target.closest?.("[data-text-size]");if(!control)return;if(control.dataset.textSize==="increase")setTextAdjustment(textAdjustment+TEXT_ADJUSTMENT_STEP);else if(control.dataset.textSize==="decrease")setTextAdjustment(textAdjustment-TEXT_ADJUSTMENT_STEP);else setTextAdjustment(DEFAULT_TEXT_ADJUSTMENT)});

function login(){$("#app").innerHTML=`<main class="login-shell"><section class="login-art"><div class="brand"><span class="brand-mark">n</span><span>Nexo<span class="brand-light">Escolar</span></span></div><div class="art-copy"><span class="eyebrow">UNA ESCUELA, EN CONEXIÓN</span><h1>Todo lo que pasa en la escuela,<br><em>en un mismo lugar.</em></h1><p>Un espacio compartido para aprender, acompañar y organizar cada día.</p><div class="art-dots"><span></span><span></span><span></span></div></div><div class="art-foot">Gestión simple. Comunidad conectada.</div></section><section class="login-panel"><div class="login-inner"><span class="eyebrow green">BIENVENIDO/A</span><h2>Ingresá a tu cuenta</h2><p class="muted">Usá el correo asociado a tu escuela.</p><form id="login-form"><label>Correo electrónico<input id="email" type="email" value="${window.NEXO_DEMO?"directivo@demo.edu":""}" autocomplete="username" required placeholder="nombre@escuela.edu"></label><label>Contraseña<div class="password-wrap"><input id="password" type="password" autocomplete="current-password" required><button type="button" class="show-pass" onclick="const p=document.querySelector('#password');p.type=p.type==='password'?'text':'password'">◉</button></div></label><button class="button primary wide">Ingresar al espacio <span>↗</span></button>${window.NEXO_DEMO?'<div class="demo-note"><span class="note-icon">i</span><span>Entorno de demostración<br><b>Contraseña: demo123</b></span></div>':''}<a class="forgot-link" href="/accounts/password_reset/">Olvidé mi contraseña</a><a class="forgot-link signup-login-link" href="/registro/">¿Dirigís una escuela? Registrala</a></form><div class="login-bottom">Nexo Escolar <span>·</span> Plataforma escolar</div></div></section></main>`;$("#login-form").onsubmit=async e=>{e.preventDefault();try{await api("/auth/login/","POST",{email:$("#email").value,password:$("#password").value});await boot()}catch(err){toast(err.message)}}}
function initials(name){return name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function navigate(p){page=p;searchTerm="";render()}
async function get(path){return cache[path]=await api(path)}
async function dashboard(){const d=await get("/dashboard"),n=d.recent||[];const stats=me.role==="alumno"||me.role==="tutor"?[["Mis calificaciones",2,"Materia y período"],["Biblioteca",4,"Libros disponibles"],["Avisos",3,"Novedades"]]:[["Alumnos activos",d.students,"En la comunidad escolar"],["Ausentes hoy",d.absent,"Asistencia del día"],["Préstamos activos",d.loans,"En biblioteca"],["Avisos publicados",d.notices,"Para toda la comunidad"]];let personal="";if(["alumno","tutor"].includes(me.role)){const g=await get("/grades");personal=`<div class="card panel-card"><div class="panel-head"><div><h3>Trayectoria académica</h3><p>Últimas calificaciones registradas</p></div><button class="text-button" data-go="Boletines">Ver boletín ↗</button></div>${gradeTable(g.slice(0,4))}</div>`}
return `<div class="welcome-card"><div class="welcome-pattern"></div><div class="welcome-copy"><span class="welcome-label">${dayLabel()}</span><h2>Un buen día para<br>estar conectados.</h2><p>Tenés todo listo para seguir de cerca lo que pasa en la escuela.</p></div><div class="welcome-illustration"><div class="sun"></div><div class="plant plant-a"></div><div class="plant plant-b"></div><div class="book-stack"><i></i><i></i><i></i></div><div class="desk"></div></div></div><div class="stat-grid">${stats.map(([label,value,sub])=>`<button class="stat-card" data-go="${label.includes('calificaciones')?'Boletines':label==='Biblioteca'?'Biblioteca':label==='Alumnos activos'?'Alumnos':label==='Ausentes hoy'?'Asistencia':label==='Préstamos activos'?'Biblioteca':'Avisos'}"><span class="stat-top"><span>${label}</span><span class="stat-icon">${label.includes('Alumnos')?'♧':label.includes('Ausentes')?'✓':label.includes('Biblioteca')||label.includes('Préstamos')?'▣':'◉'}</span></span><strong>${value}</strong><small>${sub}</small></button>`).join("")}</div><div class="dashboard-grid"><div class="card panel-card"><div class="panel-head"><div><h3>Actividad de hoy</h3><p>Lo último que está pasando</p></div><button class="text-button" data-go="Actividad">Ver actividad ↗</button></div><div class="activity-list"><div class="activity-item"><span class="activity-mark mint">✓</span><div><b>Jornada en marcha</b><p>Las clases siguen su curso en la institución.</p></div><time>Ahora</time></div><div class="activity-item"><span class="activity-mark peach">▣</span><div><b>Biblioteca abierta</b><p>Consultá el catálogo y los préstamos vigentes.</p></div><time>Hoy</time></div><div class="activity-item"><span class="activity-mark lavender">◉</span><div><b>Novedades para la comunidad</b><p>Hay información nueva en el espacio de avisos.</p></div><time>Hoy</time></div></div></div><div class="card panel-card notice-preview"><div class="panel-head"><div><h3>Avisos recientes</h3><p>Información para vos</p></div><button class="text-button" data-go="Avisos">Ver todos ↗</button></div>${n.slice(0,3).map(x=>`<article class="notice-mini"><div class="notice-line"></div><div><span>${h(x.audience)} · ${h(x.created_at)}</span><b>${h(x.title)}</b><p>${h(x.body)}</p></div></article>`).join("")}</div></div>${personal}`}
function dayLabel(){return new Intl.DateTimeFormat("es-AR",{weekday:"long",day:"numeric",month:"long"}).format(new Date())}
async function gradesPage(){const rows=await get("/grades");const periods=[...new Set(rows.map(x=>x.period))];return `<div class="toolbar"><div class="search-box"><span>⌕</span><input id="filter" placeholder="Buscar por alumno o materia…"></div><div class="toolbar-right"><span class="result-count">${rows.length} registros</span>${page==="Boletines"?`<button class="button secondary small" onclick="window.print()">↓ Descargar boletín</button>`:""}</div></div><div class="period-cards">${(periods.length?periods:["Sin período"]).map((p,i)=>`<button class="period-card ${i===0?'selected':''}" data-period="${h(p)}"><span>${h(p)}</span><b>${rows.filter(x=>x.period===p).length} <small>calificaciones</small></b><i>${i===0?'●':'○'}</i></button>`).join("")}</div><div class="card table-card"><div class="table-title"><div><h3>Registro de calificaciones</h3><p>Escala configurable por la institución · Ciclo 2026</p></div><span class="status-pill">${periods.length} períodos</span></div>${gradeTable(rows)}</div>`}

async function academicAnalyticsPage(){
  const requested={...analyticsFilters};
  if(!requested.year)requested.year=new Date().getFullYear();
  const query=new URLSearchParams();
  Object.entries(requested).forEach(([key,value])=>{if(value)query.set(key,value)});
  const data=await api(`/analytics/academic?${query.toString()}`);
  analyticsFilters={...data.filters};
  const select=(label,key,options,current)=>`<label class="analytics-filter">${label}<select data-analytics-filter="${key}">${key==="year"?"":'<option value="">Todos</option>'}${options.map(item=>`<option value="${item.id}" ${String(item.id)===String(current??"")?"selected":""}>${h(item.label)}</option>`).join("")}</select></label>`;
  const years=data.options.years.map(year=>({id:year,label:String(year)}));
  const periods=data.options.periods.map(item=>({id:item.id,label:item.name}));
  const sections=data.options.sections.map(item=>({id:item.id,label:item.label}));
  const subjects=data.options.subjects.map(item=>({id:item.id,label:item.name}));
  const val=value=>value===null||value===undefined?"—":Number(value).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct=value=>value===null||value===undefined?"—":`${val(value)}%`;
  const summary=data.summary;
  const maxGrade=Math.max(Number(data.scale.maximum)||10,1);
  const bars=(title,rows,label,emptyText)=>`<section class="card analytics-card"><div class="panel-head"><div><h3>${title}</h3><p>Promedio simple · notas cargadas</p></div></div>${rows.length?`<div class="analytics-bars">${rows.map(row=>{const width=Math.max(2,Math.min(100,Number(row.average||0)*100/maxGrade));return `<div class="analytics-bar-row"><span title="${h(row[label])}">${h(row[label])}</span><div class="analytics-track"><i style="width:${width}%"></i></div><b>${val(row.average)}</b></div>`}).join("")}</div>`:empty(emptyText)}</section>`;
  const studentRows=data.by_student.map(row=>`<tr><td><b>${h(row.student)}</b></td><td>${h(row.sections.join(", ")||"—")}</td><td>${val(row.average)}</td><td>${row.grade_count}</td><td>${pct(row.approved_percentage)}</td></tr>`).join("");
  const subjectRows=data.by_subject.map(row=>`<tr><td><b>${h(row.subject)}</b></td><td>${row.kind==="workshop"?"Taller":"Materia"}</td><td>${val(row.average)}</td><td>${row.grade_count}</td><td>${pct(row.approved_percentage)}</td></tr>`).join("");
  const table=(title,description,heads,rows,emptyText)=>`<section class="card table-card analytics-table-card"><div class="table-title"><div><h3>${title}</h3><p>${description}</p></div></div><div class="analytics-table-scroll"><table><thead><tr>${heads.map(item=>`<th>${item}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>${rows?"":empty(emptyText)}</div></section>`;
  const maxDistribution=Math.max(1,...data.distribution.map(row=>row.count));
  const distribution=data.distribution.length?`<div class="analytics-bars">${data.distribution.map(row=>`<div class="analytics-bar-row"><span>Nota ${val(row.grade)}</span><div class="analytics-track"><i style="width:${Math.max(2,row.count*100/maxDistribution)}%"></i></div><b>${row.count}</b></div>`).join("")}</div>`:empty("No hay notas para distribuir con estos filtros.");
  const periodsPanel=bars("Evolución por período",data.by_period,"period","No hay períodos con notas cargadas.");
  return `<div class="analytics-filters">${select("Ciclo lectivo","year",years,data.filters.year)}${select("Período","period_id",periods,data.filters.period_id)}${select("Salón","section_id",sections,data.filters.section_id)}${select("Materia","subject_id",subjects,data.filters.subject_id)}</div><div class="analytics-metrics"><article class="card analytics-metric"><small>Promedio general</small><strong>${val(summary.average)}</strong><span>${summary.grade_count} notas cargadas</span></article><article class="card analytics-metric"><small>Promedio de aprobación</small><strong>${pct(summary.approved_percentage)}</strong><span>${summary.approved_count} notas sobre ${summary.grade_count}</span></article><article class="card analytics-metric"><small>Alumnos con notas</small><strong>${data.by_student.length}</strong><span>En el filtro seleccionado</span></article></div><div class="analytics-grid">${bars("Comparación entre salones",data.by_section,"section","No hay salones con notas para este filtro.")}${bars("Promedios por materia",data.by_subject,"subject","No hay materias con notas para este filtro.")}${periodsPanel}<section class="card analytics-card"><div class="panel-head"><div><h3>Distribución por nota</h3><p>Escala ${val(data.scale.minimum)}–${val(data.scale.maximum)} · aprobación desde ${val(data.scale.passing)}</p></div></div>${distribution}</section></div>${table("Promedios por alumno","Se excluyen las notas faltantes.",["ALUMNO","SALÓN","PROMEDIO","NOTAS","APROBACIÓN"],studentRows,"No hay alumnos con notas en este filtro.")}${table("Detalle por materia","Promedio y porcentaje de aprobación por espacio curricular.",["MATERIA","TIPO","PROMEDIO","NOTAS","APROBACIÓN"],subjectRows,"No hay materias con notas en este filtro.")}`;
}
async function reportCardPage(){
  const result=await api("/report-cards/options");
  const students=result.students||[];
  if(!students.length)return `<div class="empty-state"><b>No hay boletines disponibles</b><p>Los alumnos necesitan una inscripción en un ciclo lectivo para generar su boletín.</p></div>`;
  const student=students.find(item=>item.id===Number(reportCardStudentId))||students[0];
  reportCardStudentId=student.id;
  const years=student.enrollments.map(item=>item.year);
  if(!years.includes(Number(reportCardYear)))reportCardYear=years.includes(new Date().getFullYear())?new Date().getFullYear():years[0];
  const report=await api(`/report-cards/${student.id}?year=${encodeURIComponent(reportCardYear)}`);
  const studentOptions=students.map(item=>`<option value="${item.id}" ${item.id===student.id?"selected":""}>${h(item.name)}</option>`).join("");
  const selectedEnrollment=student.enrollments.find(item=>item.year===Number(reportCardYear));
  const yearOptions=student.enrollments.map(item=>`<option value="${item.year}" ${item.year===Number(reportCardYear)?"selected":""}>${item.year} · ${h(item.course)} ${h(item.division)}</option>`).join("");
  return `<div class="report-controls"><label>Alumno/a<select id="report-student">${studentOptions}</select></label><label>Ciclo lectivo<select id="report-year">${yearOptions}</select></label><a class="button primary report-download" href="/api/v1/report-cards/${report.student_id}/?year=${report.academic_year}&amp;format=pdf" download>↓ Descargar boletín PDF</a></div>${reportCardMarkup(report,selectedEnrollment)}`;
}

function reportCardMarkup(report){
  const labels=["1° informe","2° informe","3° informe","Período extendido","Informe final"];
  const header=`<thead><tr><th>Área curricular</th>${labels.map(label=>`<th>${label}</th>`).join("")}</tr></thead>`;
  const subjects=report.subjects.map(subject=>`<tr><th scope="row">${h(subject.name)}</th>${subject.grades.map(grade=>`<td>${grade?h(grade):""}</td>`).join("")}</tr>`).join("");
  const attendance=(label,key)=>`<tr class="report-attendance"><th scope="row">${label}</th>${report.slots.map(slot=>`<td>${slot.attendance[key]===null?"—":slot.attendance[key]}</td>`).join("")}</tr>`;
  const missingDates=report.slots.some(slot=>!slot.attendance.configured);
  return `<article class="report-sheet"><header class="report-school"><span>${h(report.school)}</span><strong>BOLETÍN DE CALIFICACIONES</strong></header><div class="report-meta"><div><small>Ciclo lectivo</small><b>${report.academic_year}</b></div><div><small>Año</small><b>${h(report.course)}</b></div><div><small>Sección</small><b>${h(report.division)}</b></div><div class="report-student-name"><small>Alumno/a</small><b>${h(report.student)}</b></div><div><small>Comisión</small><b>${h(report.section)}</b></div></div><div class="report-table-wrap"><table class="report-table">${header}<tbody>${subjects||`<tr><td colspan="6" class="report-empty">No hay espacios curriculares asignados para este curso.</td></tr>`}${attendance("Días hábiles","school_days")}${attendance("Inasistencias","absences")}</tbody></table></div>${missingDates?`<p class="report-note">Las asistencias con guion requieren configurar las fechas de inicio y cierre del período en Configuración.</p>`:""}<div class="report-signatures"><div>Firma del/de la docente<span></span>Aclaración: ____________________</div><div>Firma del/de la director/a<span></span>Aclaración: ____________________</div><div>Firma del/de la estudiante<span></span>Aclaración: ____________________</div><div>Firma del adulto responsable<span></span>Aclaración: ____________________</div></div><footer class="report-footer"><div>Firma de la dirección<span></span></div><div><p>Promueve a: ____________________</p><p>Continúa en: ____________________</p></div></footer></article>`;
}

function gradeTable(rows){return `<table><thead><tr><th>ALUMNO</th><th>MATERIA</th><th>PERÍODO</th><th>CALIFICACIÓN</th><th>OBSERVACIÓN</th></tr></thead><tbody>${rows.map(g=>`<tr data-search="${h((g.student+g.subject+g.period).toLowerCase())}"><td><b>${h(g.student)}</b></td><td>${h(g.subject)}</td><td>${h(g.period)}</td><td><span class="grade ${Number(g.grade)>=7?'good':''}">${Number(g.grade).toLocaleString('es-AR')}</span></td><td>${h(g.note||"—")}</td></tr>`).join("")}</tbody></table>${!rows.length?empty("Aún no hay calificaciones registradas."):""}`}
async function libraryPage(){const [books,loans]=await Promise.all([get("/books"),get("/loans")]);return `<div class="library-stats"><div class="lib-stat"><span class="lib-icon mint">▣</span><div><small>En catálogo</small><b>${books.length} títulos</b></div></div><div class="lib-stat"><span class="lib-icon peach">↗</span><div><small>Préstamos activos</small><b>${loans.filter(l=>!l.returned_at).length} ejemplares</b></div></div><div class="lib-stat"><span class="lib-icon lavender">✓</span><div><small>Disponibles</small><b>${books.reduce((a,b)=>a+b.available,0)} ejemplares</b></div></div></div><div class="toolbar"><div class="search-box"><span>⌕</span><input id="filter" placeholder="Buscar título o autor…"></div><div class="toolbar-right"><span class="result-count">CATÁLOGO</span>${["school_admin","directivo","biblioteca"].includes(me.role)?'<button class="button secondary small" id="add-book">＋ Agregar título</button>':''}</div></div><div class="book-grid">${books.map((b,i)=>`<article class="book-card" data-search="${h((b.title+b.author).toLowerCase())}"><div class="book-cover cover-${i%4}"><span>NEXO<br>LECTURAS</span><i>${String(i+1).padStart(2,"0")}</i></div><div class="book-info"><small>${h(b.code)}</small><h3>${h(b.title)}</h3><p>${h(b.author)}</p><div class="book-bottom"><span class="${b.available?'available':'unavailable'}">● ${b.available?`${b.available} disponibles`:"Sin disponibilidad"}</span><span>${b.copies} ej.</span></div></div></article>`).join("")}</div><div class="table-title loans-heading"><div><h3>Préstamos y devoluciones</h3><p>Registro de quién retiró cada ejemplar y cuándo</p></div></div><div class="card table-card"><table><thead><tr><th>LIBRO</th><th>ALUMNO/A</th><th>RETIRO</th><th>VENCIMIENTO</th><th>ESTADO</th><th></th></tr></thead><tbody>${loans.map(l=>`<tr><td><b>${h(l.book)}</b></td><td>${h(l.student)}</td><td>${fmt(l.borrowed_at)}</td><td>${fmt(l.due_at)}</td><td>${l.returned_at?status("Devuelto"):status("En préstamo")}</td><td>${!l.returned_at&&["school_admin","directivo","biblioteca"].includes(me.role)?`<button class="text-button" data-return="${l.id}">Registrar devolución</button>`:""}</td></tr>`).join("")}</tbody></table>${!loans.length?empty("Todavía no hay préstamos registrados."):""}</div>`}
async function lostPage(){const [items,claims]=await Promise.all([get("/lost"),get("/claims")]);return `<div class="lost-intro"><div><b>¿Perdiste algo?</b><p>Revisá los objetos encontrados y reclamalo. El equipo de preceptoría te ayuda a recuperarlo.</p></div><span>⌕</span></div><div class="toolbar"><div class="search-box"><span>⌕</span><input id="filter" placeholder="Buscar objetos…"></div><div class="toolbar-right"><span class="result-count">${items.filter(x=>x.status==='Publicado').length} publicaciones</span></div></div><div class="lost-grid">${items.map((x,i)=>`<article class="lost-card" data-search="${h((x.title+x.description+x.place).toLowerCase())}"><div class="lost-image lost-${i%4}"><span>${["◈","◍","⌑","◇"][i%4]}</span><small>${h(x.place||"Escuela")}</small></div><div class="lost-content"><div class="lost-date">ENCONTRADO · ${fmt(x.created_at)}</div><h3>${h(x.title)}</h3><p>${h(x.description)}</p><div class="lost-foot">${status(x.status)}${me.role==="alumno"&&x.status==="Publicado"?`<button class="button primary small" data-claim="${x.id}">Lo reclamo</button>`:""}</div></div></article>`).join("")}</div>${claims.length?`<div class="card table-card claims"><div class="table-title"><div><h3>Reclamos recibidos</h3><p>Solicitudes de alumnos para recuperar sus objetos</p></div></div><table><thead><tr><th>OBJETO</th><th>ALUMNO/A</th><th>MENSAJE</th><th>ESTADO</th><th></th></tr></thead><tbody>${claims.map(c=>`<tr><td>${h(c.item)}</td><td>${h(c.student)}</td><td>${h(c.message||"—")}</td><td>${status(c.status)}</td><td>${c.status==="Pendiente"&&["school_admin","directivo","secretaria","preceptor"].includes(me.role)?`<button class="text-button" data-resolve="${c.id}">Marcar resuelto</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:""}`}
async function settingsPage(){const s=await get("/settings");const activeTheme=s.theme||"forest";const themeCard=`<section class="card settings-card school-theme-settings"><div class="panel-head"><div><h3>Tema de la escuela</h3><p>Elegí una paleta para toda la institución. El cambio se guarda y se aplica en las distintas secciones.</p></div></div><div class="school-theme-options">${schoolThemeOptions.map(t=>`<button type="button" class="school-theme-option ${t.value===activeTheme?"selected":""}" data-school-theme-choice="${t.value}" aria-pressed="${t.value===activeTheme}" aria-label="Usar tema ${t.label}"><span class="school-theme-mark ${t.value}" aria-hidden="true"><i></i><i></i><i></i></span><span><b>${t.label}</b><small>${t.description}</small></span>${t.value===activeTheme?'<span class="theme-selected">En uso</span>':""}</button>`).join("")}</div></section>`;return `<div class="settings-grid">${themeCard}<section class="card settings-card"><div class="panel-head"><div><h3>Organización escolar</h3><p>Cursos, materias y períodos del ciclo lectivo.</p></div></div><div class="setting-group"><div class="setting-head"><b>Cursos y divisiones</b><button data-setting="course">＋ Agregar</button></div><div class="chip-list">${s.courses.map(c=>`<span class="setting-chip">${h(c.name)}</span>`).join("")}</div></div><div class="setting-group"><div class="setting-head"><b>Materias</b><button data-setting="subject">＋ Agregar</button></div><div class="chip-list">${s.subjects.map(c=>`<span class="setting-chip">${h(c.name)}</span>`).join("")}</div></div><div class="setting-group"><div class="setting-head"><b>Períodos académicos</b><button data-setting="period">＋ Agregar</button></div><div class="chip-list">${s.periods.map(c=>`<button type="button" class="setting-chip period-setting-chip" data-period-config="${c.id}" title="Configurar fechas y columna del boletín">${h(c.name)} · ${c.year} · ${h(({report_1:"1° informe",report_2:"2° informe",report_3:"3° informe",extended:"Extendido",final:"Final",auto:"Automático"})[c.report_slot]||"Informe")}</button>`).join("")}</div></div><div class="setting-group"><div class="setting-head"><b>Escala de calificaciones</b><button data-setting="scale">＋ Configurar</button></div><div class="chip-list"><span class="setting-chip">${s.scale.min} a ${s.scale.max}</span></div></div></section><section class="card settings-card"><div class="panel-head"><div><h3>Cuentas y permisos</h3><p>Acceso personal según función en la escuela.</p></div><button class="button secondary small" data-setting="user">＋ Crear cuenta</button></div><div class="account-list">${s.users.map(u=>`<div class="account-row"><span class="avatar avatar-small">${initials(u.name)}</span><div><b>${h(u.name)}</b><small>${h(u.email)}</small></div><span class="role-tag">${roleNames[u.role]}</span></div>`).join("")}</div></section><section class="card settings-card config-note"><span class="note-icon">i</span><div><b>Un espacio para cada rol</b><p>Las secciones y acciones visibles cambian según el perfil de acceso. Los tutores consultan solamente la información de sus alumnos vinculados.</p></div></section><section class="card settings-card"><div class="panel-head"><div><h3>Exportar información</h3><p>Descargá archivos CSV de los registros de esta escuela.</p></div></div><div class="chip-list"><a class="button secondary small" href="/api/v1/exports/students/">Alumnos</a><a class="button secondary small" href="/api/v1/exports/attendance/">Asistencia</a><a class="button secondary small" href="/api/v1/exports/grades/">Calificaciones</a><a class="button secondary small" href="/api/v1/exports/loans/">Biblioteca</a></div></section></div>`}
async function auditPage(){const rows=await get("/audit");return `<div class="card table-card"><table><thead><tr><th>ACCIÓN</th><th>DETALLE</th><th>USUARIO</th><th>FECHA Y HORA</th></tr></thead><tbody>${rows.map(a=>`<tr><td><span class="audit-action">${h(a.action)}</span></td><td>${h(a.detail)}</td><td>${h(a.user||"Sistema")}</td><td>${h(a.created_at)}</td></tr>`).join("")}</tbody></table>${!rows.length?empty("Todavía no hay movimientos registrados."):""}</div>`}
function status(s){const cls=s==="Presente"||s==="Devuelto"||s==="Resuelto"?"green":s==="Ausente"||s==="Pendiente"?"red":s==="Tarde"?"orange":"blue";return `<span class="status-pill ${cls}">${h(s)}</span>`}
function fmt(d){if(!d)return"—";const x=new Date(String(d).slice(0,10)+"T12:00:00");return new Intl.DateTimeFormat("es-AR",{day:"2-digit",month:"short",year:"numeric"}).format(x)}
function empty(msg){return `<div class="empty-table">${h(msg)}</div>`}
async function loanForm(){const [b,s]=await Promise.all([api("/books"),api("/students")]);modal("Registrar préstamo",`${field("Libro","book_id","select",{options:b.filter(x=>x.available>0).map(x=>({value:x.id,label:`${x.title} · ${x.available} disponibles`}))})}${field("Alumno/a","student_id","select",{options:s.map(x=>({value:x.id,label:`${x.name} · ${x.course} ${x.division}`}))})}${field("Fecha de retiro","borrowed_at","datetime-local",{value:new Date().toISOString().slice(0,16)})}${field("Fecha de devolución","due_at","date",{value:new Date(Date.now()+14*86400000).toISOString().slice(0,10)})}`,"Registrar préstamo",v=>{v.borrowed_at=v.borrowed_at.replace("T"," ")+":00";return api("/loans","POST",v)})}
function bookForm(){modal("Agregar título al catálogo",`${field("Título","title")}${field("Autor/a","author")}${field("Código","code")}${field("Cantidad de ejemplares","copies","number",{value:1,min:1})}`,"Agregar al catálogo",v=>api("/books","POST",v))}
function lostForm(){modal("Publicar objeto encontrado",`${field("¿Qué encontraste?","title")}${field("Lugar","place","text",{placeholder:"Ej. patio, aula…",required:false})}<label>Descripción <textarea name="description" rows="3" placeholder="Color, marca u otra característica"></textarea></label>`,"Publicar aviso",v=>api("/lost","POST",v))}
function noticeForm(){modal("Nuevo aviso",`${field("Título","title")}${field("Destinatarios","audience","select",{options:["Todos","Alumnos","Familias","Docentes","Personal"].map(x=>({value:x,label:x}))})}<label>Mensaje <textarea name="body" rows="4" required></textarea></label>`,"Publicar aviso",v=>api("/notices","POST",v))}
function claimForm(id){modal("Reclamar objeto",`<p class="form-intro">Contanos algún detalle para ayudar a confirmar que es tuyo.</p><label>Mensaje <textarea name="message" rows="3" placeholder="Ej. tiene mi nombre escrito"></textarea></label>`,"Enviar reclamo",v=>api("/claims","POST",{...v,item_id:id}))}
async function update(path,data){try{await api(path,"PUT",data);toast("Registro actualizado");cache={};loadPage()}catch(e){toast(e.message)}}
function parseCsv(text){const rows=[];let row=[],value="",quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){value+='"';i++}else if(c==='"'){quoted=!quoted}else if(c===","&&!quoted){row.push(value);value=""}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(value);if(row.some(x=>x!==""))rows.push(row);row=[];value=""}else value+=c}row.push(value);if(row.some(x=>x!==""))rows.push(row);return rows}
async function logout(){await api("/auth/logout/","POST");me=null;login()}
async function start(){await boot();document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();$("#filter")?.focus()}if(e.key==="Escape")$("#modal-root").innerHTML=""})}
// Multi-institution and configurable curriculum flows.

async function boot(){
  try {
    me = await api("/me/");
    loadTextAdjustment();
    loadDarkMode();
    loadSchoolTheme();
    if (me.role === "platform_admin") { window.location.replace("/plataforma/"); return; }
    if (!me.school_id) { login(); toast("Tu cuenta todavía no tiene una escuela habilitada."); return; }
    render();
  } catch { login(); }
}

function headingEyebrow(){
  return {Inicio:"MI ESPACIO",Alumnos:"COMUNIDAD ESCOLAR",Asistencia:"SEGUIMIENTO DIARIO",Calificaciones:"TRAYECTORIA ACADÉMICA",Boletines:"RESUMEN ACADÉMICO",Biblioteca:"LECTURA Y CONSULTA","Objetos perdidos":"ENCONTRÁ LO QUE BUSCÁS",Avisos:"NOVEDADES DE LA ESCUELA",Configuración:"ADMINISTRACIÓN",Actividad:"SEGUIMIENTO","Plan de estudios":"CURRÍCULA ESCOLAR","Estadísticas":"ANÁLISIS ACADÉMICO","Centro de ayuda":"GUÍAS Y RESPUESTAS"}[page]||me.school_name||"NEXO ESCOLAR";
}

function description(){
  return {Inicio:`Hola, ${me.name.split(" ")[0]}. Así se mueve nuestra comunidad hoy.`,Alumnos:"Alumnos, cursos y divisiones de la institución.",Asistencia:"Registrá y consultá asistencia por jornada, clase o taller.",Calificaciones:"Acompañá el avance de cada estudiante.",Boletines:"Boletín por alumno con informes, asistencia y espacios de firma.",Biblioteca:"Catálogo, préstamos y devoluciones en un solo lugar.","Objetos perdidos":"Avisos publicados por el equipo de la escuela.",Avisos:"Información importante para la comunidad.",Configuración:"Administrá materias, períodos, escalas y cuentas.",Actividad:"Un registro de las acciones recientes en la plataforma.","Plan de estudios":"Configurá planes, orientaciones, años, talleres y comisiones.","Estadísticas":"Explorá promedios, aprobación y evolución por período en esta escuela.","Centro de ayuda":"Tutoriales paso a paso, respuestas rápidas y recomendaciones según tu perfil."}[page]||"";
}

function shell(){
  const nav=[...(permissions[me.role]||["Inicio"])];
  if(me.analytics_enabled&&["school_admin","directivo","secretaria","preceptor"].includes(me.role))nav.push("Estadísticas");
  if(!nav.includes("Centro de ayuda"))nav.push("Centro de ayuda");
  const schoolType=me.school_type==="technical"?"Secundaria técnica":"Secundaria común";
  const schoolName=me.school_name||"Nexo Escolar";
  const schoolDetails=`<div class="school-icon">${initials(schoolName)}</div><div><b>${h(schoolName)}</b><small>${me.school_id?`${schoolType}${me.jurisdiction?` · ${h(me.jurisdiction)}`:""}`:"Consola de plataforma"}</small></div>`;
  const schoolControl=me.schools.length>1
    ? `<button class="school-switch" id="school-switch" type="button" aria-label="Cambiar de escuela">${schoolDetails}<span class="chevron">⌄</span></button>`
    : `<div class="school-current">${schoolDetails}</div>`;
  return `<div class="layout"><aside class="sidebar"><div class="brand"><span class="brand-mark">n</span><span>Nexo<span class="brand-light">Escolar</span></span></div>${schoolControl}<div class="nav-label">MENÚ PRINCIPAL</div><nav>${nav.map(x=>`<button class="nav-item ${page===x?'active':''}" data-page="${x}"><span class="nav-icon">${icons[x]||"▦"}</span>${x}${x==="Avisos"?'<i class="nav-dot"></i>':''}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="help-card"><div class="help-icon">✦</div><b>¿Necesitás ayuda?</b><p>Estamos para acompañarte.</p><button data-page="Centro de ayuda">Ver centro de ayuda <span>↗</span></button></div><button class="user-card" id="profile-menu"><span class="avatar">${initials(me.name)}</span><span class="user-meta"><b>${h(me.name)}</b><small>${roleNames[me.role]||"Cuenta"}</small></span><span class="more">···</span></button></div></aside><main class="main"><header class="topbar"><button id="mobile-menu" class="mobile-menu">☰</button><div class="breadcrumbs">${h(schoolName)} <span>/</span> <b>${page}</b></div><div class="top-actions">${textSizeControls()}${themeToggleControl()}${me.school_id?`<span class="term-pill">● <span>${new Date().getFullYear()}</span></span>`:""}${me.school_id?`<button class="icon-button" title="Avisos" onclick="navigate('Avisos')">♧<i></i></button>`:""}<div class="top-avatar">${initials(me.name)}</div></div></header><div class="content"><div class="page-heading"><div><span class="eyebrow green">${headingEyebrow()}</span><h1>${page}</h1><p>${description()}</p></div>${headingAction()}</div><section id="view"></section><footer>© ${new Date().getFullYear()} ${h(schoolName)} <span>·</span> Nexo Escolar</footer></div></main></div><div id="modal-root"></div>`
}

function headingAction(){
  const act={
    "Plan de estudios":["＋ Nuevo plan",()=>planForm()],
    Alumnos:["＋ Nuevo alumno",()=>studentForm()], Asistencia:["＋ Pasar asistencia",()=>attendanceForm()],
    Calificaciones:["＋ Cargar nota",()=>gradeForm()], Biblioteca:["＋ Registrar préstamo",()=>loanForm()],
    "Objetos perdidos":["＋ Publicar objeto",()=>lostForm()], Avisos:["＋ Nuevo aviso",()=>noticeForm()],
    Configuración:["＋ Crear cuenta",()=>settingForm("user")]
  }[page];
  return act&&actAllowed()?`<button class="button primary" id="heading-action">${act[0]}</button>`:"";
}

function actAllowed(){
  return {Alumnos:["school_admin","directivo","secretaria"],Asistencia:["school_admin","directivo","secretaria","preceptor"],Calificaciones:["school_admin","directivo","docente"],Biblioteca:["school_admin","directivo","biblioteca"],"Objetos perdidos":["school_admin","directivo","preceptor","secretaria"],Avisos:["school_admin","directivo","secretaria","preceptor"],Configuración:["school_admin","directivo"],"Plan de estudios":["school_admin","directivo"]}[page]?.includes(me.role);
}

function render(){
  document.querySelector("#app").innerHTML=shell();
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>navigate(b.dataset.page));
  const ha=$("#heading-action");
  if(ha)ha.onclick=()=>({"Plan de estudios":planForm,Alumnos:studentForm,Asistencia:attendanceForm,Calificaciones:gradeForm,Biblioteca:loanForm,"Objetos perdidos":lostForm,Avisos:noticeForm,Configuración:()=>settingForm("user")}[page])();
  $("#profile-menu").onclick=logout;
  $("#mobile-menu").onclick=()=>$(".sidebar").classList.toggle("open");
  const switchButton=$("#school-switch");
  if(switchButton)switchButton.onclick=schoolSwitcher;
  loadPage();
}

async function loadPage(){
  const target=$("#view"); target.innerHTML='<div class="loading"><span></span> Cargando información…</div>';
  try {
    let html;
    if(page==="Inicio") html=await dashboard();
    else if(page==="Alumnos") html=await studentsPage();
    else if(page==="Asistencia") html=await attendancePage();
    else if(page==="Calificaciones") html=await gradesPage();
    else if(page==="Boletines") html=await reportCardPage();
    else if(page==="Biblioteca") html=await libraryPage();
    else if(page==="Objetos perdidos") html=await lostPage();
    else if(page==="Avisos") html=await noticesPage();
    else if(page==="Calendario") html=await calendarPage();
    else if(page==="Estadísticas") html=await academicAnalyticsPage();
    else if(page==="Centro de ayuda") html=helpCenterPage();
    else if(page==="Configuración") html=await settingsPage();
    else if(page==="Plan de estudios") html=await curriculumPage();
    else html=await auditPage();
    target.innerHTML=html; bindPage();
    if(page==="Inicio") attachFollowup();
  } catch(e) { target.innerHTML=`<div class="empty-state"><b>No se pudo cargar la información</b><p>${h(e.message)}</p><button class="button secondary" onclick="loadPage()">Reintentar</button></div>`; }
}

function schoolSwitcher(){
  if(me.schools.length<2)return;
  const options=me.schools.map(s=>({value:s.id,label:`${s.name} · ${roleNames[s.role]||"Cuenta"}`}));
  modal("Cambiar de escuela",field("Institución","school_id","select",{options,value:me.school_id}),"Continuar",async v=>{
    await api("/schools","POST",{school_id:v.school_id});
    page="Inicio"; cache={}; await boot();
  });
}

async function curriculumPage(){
  const [plans,years,sections,offerings,settings]=await Promise.all([api("/academic-plans"),api("/plan-years"),api("/sections"),api("/offerings"),api("/settings")]);
  return `<div class="notice-banner"><span>▧</span><div><b>Configuración curricular por institución</b><p>Definí planes comunes o técnicos, ciclos, orientaciones, materias, talleres, comisiones y asignaciones docentes.</p></div></div><div class="settings-grid"><section class="card settings-card"><div class="panel-head"><div><h3>Planes y orientaciones</h3><p>Vigencia y jurisdicción de cada plan.</p></div></div><div class="account-list">${plans.map(p=>`<div class="account-row"><span class="lib-icon ${p.school_type==="technical"?"peach":"mint"}">▧</span><div><b>${h(p.name)}</b><small>${p.school_type==="technical"?"Técnica":"Común"} · desde ${p.valid_from_year} · ${h(p.orientation||"Sin orientación")}</small></div><span class="role-tag">${h(p.jurisdiction||"Provincia a definir")}</span></div>`).join("")||empty("Todavía no hay planes.")}</div></section><section class="card settings-card"><div class="panel-head"><div><h3>Años y espacios curriculares</h3><p>Materias, talleres y carga horaria semanal.</p></div><button class="button secondary small" data-curriculum="year">＋ Agregar año</button></div><div class="account-list">${years.map(y=>`<div class="account-row"><span class="lib-icon lavender">${y.ordinal}</span><div><b>${h(y.year_label)} · ${h(y.plan_id?plans.find(p=>p.id===y.plan_id)?.name||"Plan":"Plan")}</b><small>${h(y.cycle||"")} ${y.orientation?`· ${h(y.orientation)}`:""}</small><small>${y.subjects.map(s=>`${h(s.name)} (${s.kind==="workshop"?"taller":"materia"})`).join(" · ")}</small></div></div>`).join("")||empty("Agregá años y espacios curriculares al plan.")}</div></section><section class="card settings-card"><div class="panel-head"><div><h3>Comisiones</h3><p>Divisiones y turnos para cada ciclo lectivo.</p></div><button class="button secondary small" data-curriculum="section">＋ Agregar comisión</button></div><div class="chip-list">${sections.map(s=>`<span class="setting-chip">${h(s.name)} · ${h(s.shift_label)} · ${s.academic_year}</span>`).join("")||"Sin comisiones"}</div></section><section class="card settings-card"><div class="panel-head"><div><h3>Materias, talleres y docentes</h3><p>Comisiones con personal docente asignado.</p></div><button class="button secondary small" data-curriculum="offering">＋ Asignar</button></div><div class="account-list">${offerings.map(o=>`<div class="account-row"><span class="lib-icon ${o.kind==="workshop"?"peach":"mint"}">▣</span><div><b>${h(o.subject)} · ${h(o.section.name)}</b><small>${h(o.kind==="workshop"?"Taller":"Materia")} · ${o.teachers.map(h).join(", ")||"Sin docente asignado"}</small></div></div>`).join("")||empty("Todavía no hay asignaciones.")}</div></section></div>`;
}

async function planForm(){
  modal("Crear plan de estudios",`${field("Nombre del plan","name")}${field("Tipo de secundaria","school_type","select",{options:[{value:"common",label:"Secundaria común"},{value:"technical",label:"Secundaria técnica"}]})}${field("Provincia / jurisdicción","jurisdiction","text",{required:false,placeholder:me.jurisdiction||"A definir"})}${field("Orientación","orientation","text",{required:false,placeholder:"Ej. Informática, Ciencias Sociales"})}${field("Vigente desde el ciclo lectivo","valid_from_year","number",{value:new Date().getFullYear(),min:2000,max:2100})}`,"Crear plan",async v=>{v.valid_from_year=Number(v.valid_from_year);await api("/academic-plans","POST",v);});
}

async function planYearForm(){
  const [plans,s]=await Promise.all([api("/academic-plans"),api("/settings")]);
  modal("Agregar año al plan",`${field("Plan","plan_id","select",{options:plans.map(p=>({value:p.id,label:`${p.name} · ${p.school_type==="technical"?"Técnica":"Común"}`}))})}${field("Nombre del año","year_label","text",{placeholder:"1° año"})}${field("Orden","ordinal","number",{min:1,max:12})}${field("Ciclo","cycle","text",{required:false,placeholder:"Ciclo básico / orientado"})}${field("Orientación","orientation","text",{required:false})}${field("Materias y talleres","subject_ids","select",{multiple:true,required:false,options:s.subjects.map(x=>({value:x.id,label:`${x.name} · ${x.kind==="workshop"?"Taller":"Materia"}`}))})}`,"Guardar año",async v=>{v.plan_id=Number(v.plan_id);v.ordinal=Number(v.ordinal);v.subjects=(v.subject_ids||[]).map(id=>({subject_id:Number(id),weekly_hours:0}));delete v.subject_ids;await api("/plan-years","POST",v);});
}

async function sectionForm(){
  const years=await api("/plan-years");
  modal("Crear comisión",`${field("Año del plan","plan_year_id","select",{options:years.map(y=>({value:y.id,label:`${y.year_label} · ${y.orientation||"Sin orientación"}`}))})}${field("División","division","text",{placeholder:"A"})}${field("Turno","shift","select",{options:[{value:"morning",label:"Mañana"},{value:"afternoon",label:"Tarde"},{value:"evening",label:"Vespertino"},{value:"night",label:"Noche"}]})}${field("Ciclo lectivo","academic_year","number",{value:new Date().getFullYear(),min:2000,max:2100})}${field("Nombre visible","name","text",{required:false,placeholder:"1° A"})}`,"Crear comisión",async v=>{v.plan_year_id=Number(v.plan_year_id);v.academic_year=Number(v.academic_year);await api("/sections","POST",v);});
}

async function offeringForm(){
  const [sections,s]=await Promise.all([api("/sections"),api("/settings")]);
  const teachers=s.users.filter(u=>u.role==="docente");
  modal("Asignar materia, taller y docentes",`${field("Comisión","section_id","select",{options:sections.map(x=>({value:x.id,label:`${x.name} · ${x.academic_year}`}))})}${field("Materia o taller","subject_id","select",{options:s.subjects.map(x=>({value:x.id,label:`${x.name} · ${x.kind==="workshop"?"Taller":"Materia"}`}))})}${field("Docentes","teacher_membership_ids","select",{multiple:true,required:false,options:teachers.map(x=>({value:x.membership_id,label:`${x.name} · ${x.email}`}))})}`,"Guardar asignación",async v=>{v.section_id=Number(v.section_id);v.subject_id=Number(v.subject_id);v.teacher_membership_ids=(v.teacher_membership_ids||[]).map(Number);await api("/offerings","POST",v);});
}

async function studentsPage(){
  const rows=await api("/students");
  return `<div class="toolbar"><div class="search-box"><span>⌕</span><input id="filter" placeholder="Buscar alumno…"><kbd>⌘ K</kbd></div><div class="toolbar-right"><span class="result-count">${rows.length} alumnos</span>${actAllowed()?`<button class="button secondary small" onclick="downloadCsv()">↓ Exportar</button><div class="select-compact">${field("","import-resource","select",{options:[{value:"students",label:"Alumnos"},{value:"courses",label:"Cursos"},{value:"subjects",label:"Materias y talleres"},{value:"staff",label:"Personal"}]})}</div><button class="button secondary small" id="download-template-csv">Plantilla CSV</button><button class="button secondary small" id="download-template-xlsx">Plantilla Excel</button><label class="button secondary small import-button">↑ Importar CSV/XLSX<input type="file" accept=".csv,.xlsx,text/csv" id="csv-file" hidden></label>`:""}</div></div><div class="card table-card"><table><thead><tr><th>ALUMNO</th><th>CURSO</th><th>DIVISIÓN</th><th>TURNO</th><th>ESTADO</th><th></th></tr></thead><tbody>${rows.map(s=>`<tr data-search="${h((s.name+s.course+s.division).toLowerCase())}"><td><div class="person-cell"><span class="avatar avatar-small">${initials(s.name)}</span><span><b>${h(s.name)}</b><small>${h(s.email||"Sin correo cargado")}</small></span></div></td><td>${h(s.course)}</td><td>${h(s.division)}</td><td>${h(s.shift||"—")}</td><td><span class="status-pill active-pill">${h(s.status)}</span></td><td>${actAllowed()?`<button class="text-button" data-enroll="${s.id}">Inscribir</button>`:""}</td></tr>`).join("")}</tbody></table>${!rows.length?empty("No hay alumnos para mostrar"):""}</div><p class="table-foot">Información de la comunidad escolar · Ciclo lectivo actual</p>`;
}

async function studentForm(){
  const sections=await api("/sections");
  const sectionField=sections.length
    ? field("Comisión","section_id","select",{options:sections.map(x=>({value:x.id,label:`${x.name} · ${x.academic_year}`}))})
    : `<p class="form-intro">Todavía no hay comisiones cargadas. Indicá curso, división y turno; la primera comisión se creará junto con el alumno.</p>${field("Curso o año","course","text",{placeholder:"Ej. 1° año"})}${field("División","division","text",{value:"A",placeholder:"A"})}${field("Turno","shift","select",{value:"morning",options:[{value:"morning",label:"Mañana"},{value:"afternoon",label:"Tarde"},{value:"evening",label:"Vespertino"},{value:"night",label:"Noche"}]})}`;
  modal("Nuevo alumno",`${field("Nombre y apellido","name")}${field("Identificador escolar","source_id","text",{required:false})}${field("Correo electrónico","email","email",{required:false})}${sectionField}`,"Crear alumno",async v=>{if(sections.length)v.section_id=Number(v.section_id);await api("/students","POST",v);});
}

async function gradeForm(){
  const [students,options]=await Promise.all([api("/students"),api("/academic-options")]);
  modal("Cargar calificación",`${field("Alumno/a","student_id","select",{options:students.map(s=>({value:s.id,label:`${s.name} · ${s.course} ${s.division}`}))})}${field("Materia o taller","subject","select",{options:options.subjects.map(s=>({value:s.name,label:`${s.name} · ${s.kind==="workshop"?"Taller":"Materia"}`}))})}${field("Período","period_id","select",{options:options.periods.map(p=>({value:p.id,label:`${p.name} · ${p.year}`}))})}${field("Nota","grade","number",{min:options.scale.min,max:options.scale.max,step:"0.1",placeholder:`${options.scale.min} a ${options.scale.max}`})}<label>Observación <textarea name="note" rows="2"></textarea></label>`,"Guardar nota",async v=>{v.student_id=Number(v.student_id);v.period_id=Number(v.period_id);await api("/grades","POST",v);});
}

async function settingForm(kind,periodId=null){
  if(kind==="user"){
    const students=await api("/students");
    const roles=Object.entries(roleNames).filter(([r])=>["school_admin","directivo","secretaria","preceptor","docente","biblioteca","alumno","tutor"].includes(r));
    modal("Invitar a la escuela",`${field("Nombre y apellido","name")}${field("Correo electrónico","email","email")}${field("Rol","role","select",{options:roles.map(([value,label])=>({value,label}))})}<label>Alumnos vinculados (para estudiante o tutor)<select name="linked_student_ids" multiple size="5">${students.map(s=>`<option value="${s.id}">${h(s.name)} · ${h(s.course)} ${h(s.division)}</option>`).join("")}</select><small>Un tutor puede vincularse con varios hermanos. Una cuenta de alumno se vincula con un solo perfil.</small></label>`,"Enviar invitación",async v=>{v.linked_student_ids=Array.from(document.querySelector('#modal-form [name="linked_student_ids"]').selectedOptions).map(o=>Number(o.value));if(v.role==="alumno"){if(v.linked_student_ids.length!==1)throw Error("Elegí exactamente un alumno para la cuenta.");v.linked_student_id=v.linked_student_ids[0];}await api("/settings","POST",{...v,kind});});
  } else if(kind==="scale"){
    const s=await api("/settings"); modal("Escala de calificaciones",`${field("Nota mínima","min","number",{value:s.scale.min,step:"0.1"})}${field("Nota máxima","max","number",{value:s.scale.max,step:"0.1"})}${field("Nota de aprobación","passing","number",{value:s.scale.passing,step:"0.1"})}`,"Guardar escala",async v=>{await api("/settings","POST",{...v,kind});});
  } else if(kind==="school_theme"){
    const current=await api("/settings");
    const ordered=[...schoolThemeOptions].sort((a,b)=>Number(b.value===current.theme)-Number(a.value===current.theme));
    modal("Tema de la escuela",`${field("Paleta institucional","theme","select",{options:ordered.map(t=>({value:t.value,label:`${t.label} · ${t.description}`}))})}<p class="form-intro">Este tema se guarda para la escuela y se verá en las cuentas de todos sus integrantes.</p>`,"Guardar tema",async v=>{await api("/settings","POST",{kind,theme:v.theme});me.school_theme=v.theme;setSchoolTheme(v.theme);return {message:"Tema institucional guardado."}});
  } else if(kind==="period"){
    const settings=await api("/settings");
    const current=settings.periods.find(item=>item.id===Number(periodId));
    const slotOptions=[{value:"report_1",label:"1° informe"},{value:"report_2",label:"2° informe"},{value:"report_3",label:"3° informe"},{value:"extended",label:"Período extendido"},{value:"final",label:"Informe final"},{value:"auto",label:"Automático por orden y nombre"}];
    const body=`${field("Nombre del período","name","text",{value:current?.name||""})}${field("Año","year","number",{value:current?.year||new Date().getFullYear(),min:2000,max:2100})}${field("Orden","order","number",{value:current?.order||1,min:1})}${field("Columna del boletín","report_slot","select",{value:current?.report_slot||"report_1",options:slotOptions})}<div class="form-row">${field("Fecha de inicio","starts_on","date",{value:current?.starts_on||"",required:false})}${field("Fecha de cierre","ends_on","date",{value:current?.ends_on||"",required:false})}</div><p class="form-intro">Las fechas delimitan los días hábiles y las inasistencias que aparecen en esta columna. Dejá ambas vacías o cargá las dos.</p>`;
    modal(current?"Configurar período académico":"Agregar período académico",body,current?"Guardar cambios":"Guardar período",async v=>{v.year=Number(v.year);v.order=Number(v.order);if(periodId)v.period_id=Number(periodId);return api("/settings","POST",{...v,kind});});
  } else {
    const label={course:"curso",subject:"materia o taller",period:"período"}[kind];
    const body=`${field(kind==="course"?"Nombre del curso":"Nombre", "name", "text",{placeholder:kind==="course"?"Ej. 5°":""})}${kind==="subject"?field("Tipo","subject_kind","select",{options:[{value:"subject",label:"Materia"},{value:"workshop",label:"Taller"}]}):""}${kind==="period"?`${field("Año","year","number",{value:new Date().getFullYear()})}${field("Orden","order","number",{value:1,min:1})}`:""}`;
    modal(`Agregar ${label}`,body,"Guardar",async v=>{if(kind==="period"){v.year=Number(v.year);v.order=Number(v.order);}await api("/settings","POST",{...v,kind});});
  }
}

function field(label,name,type="text",opts={}){
  if(type==="select")return `<label>${label||"&nbsp;"}<select name="${name}" ${opts.multiple?`multiple size="${opts.size||5}"`:""} ${opts.required===false||opts.multiple?'':'required'}>${opts.options.map(x=>`<option value="${h(x.value)}" ${opts.value!==undefined&&String(opts.value)===String(x.value)?"selected":""}>${h(x.label)}</option>`).join("")}</select></label>`;
  return `<label>${label}<input name="${name}" type="${type}" ${opts.value!==undefined?`value="${h(opts.value)}"`:""} ${opts.required===false?'':'required'} ${opts.min!==undefined?`min="${opts.min}"`:""} ${opts.max!==undefined?`max="${opts.max}"`:""} ${opts.step?`step="${opts.step}"`:""} placeholder="${h(opts.placeholder||"")}"></label>`;
}

function modal(title,body,submitLabel="Guardar",onSubmit){
  $("#modal-root").innerHTML=`<div class="modal-backdrop" id="modal-backdrop"><div class="modal"><div class="modal-head"><div><span class="eyebrow green">NEXO ESCOLAR</span><h2>${title}</h2></div><button class="close-modal" id="close-modal">×</button></div><form id="modal-form">${body}<div class="modal-actions"><button type="button" class="button secondary" id="cancel-modal">Cancelar</button><button class="button primary">${submitLabel}</button></div></form></div></div>`;
  const close=()=>$("#modal-root").innerHTML=""; $("#close-modal").onclick=close; $("#cancel-modal").onclick=close;
  $("#modal-backdrop").onclick=e=>{if(e.target.id==="modal-backdrop")close()};
  $("#modal-form").onsubmit=async e=>{e.preventDefault();const vals=Object.fromEntries(new FormData(e.target));e.target.querySelectorAll("select[multiple]").forEach(s=>vals[s.name]=Array.from(s.selectedOptions).map(o=>o.value));try{const result=await onSubmit(vals);close();toast(result?.message||"Cambios guardados correctamente");cache={};loadPage()}catch(err){toast(err.message)}};
}

function bindPage(){
  const filter=$("#filter"); if(filter)filter.oninput=()=>{const q=filter.value.toLowerCase();document.querySelectorAll("[data-search]").forEach(x=>x.style.display=x.dataset.search.includes(q)?"":"none")};
  const reportStudent=$("#report-student"); if(reportStudent)reportStudent.onchange=()=>{reportCardStudentId=Number(reportStudent.value);reportCardYear=null;loadPage()};
  const reportYear=$("#report-year"); if(reportYear)reportYear.onchange=()=>{reportCardYear=Number(reportYear.value);loadPage()};
  document.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>navigate(x.dataset.go));
  const helpSearch=$("#help-search"); if(helpSearch)helpSearch.oninput=()=>{const query=helpSearch.value.trim().toLowerCase();let visible=0;document.querySelectorAll("[data-help-searchable]").forEach(item=>{item.hidden=!item.textContent.toLowerCase().includes(query);if(!item.hidden)visible++});const emptyState=$("#help-search-empty");if(emptyState)emptyState.hidden=visible>0};
  const csv=$("#csv-file"); if(csv)csv.onchange=importCsv;
  const templateCsv=$("#download-template-csv"),templateXlsx=$("#download-template-xlsx"); if(templateCsv)templateCsv.onclick=()=>downloadTemplate("csv"); if(templateXlsx)templateXlsx.onclick=()=>downloadTemplate("xlsx");
  const addBook=$("#add-book"); if(addBook)addBook.onclick=bookForm;
  const save=$("#save-attendance"); if(save)save.onclick=saveAttendance;
  document.querySelectorAll("[data-return]").forEach(x=>x.onclick=()=>update("/loans/"+x.dataset.return,{}));
  document.querySelectorAll("[data-claim]").forEach(x=>x.onclick=()=>claimForm(x.dataset.claim));
  document.querySelectorAll("[data-resolve]").forEach(x=>x.onclick=()=>update("/claims/"+x.dataset.resolve,{status:"Resuelto"}));
  document.querySelectorAll("[data-school-theme-choice]").forEach(button=>button.onclick=async()=>{const theme=button.dataset.schoolThemeChoice;if(theme===me.school_theme)return;document.querySelectorAll("[data-school-theme-choice]").forEach(option=>{option.disabled=true;option.setAttribute("aria-busy","true")});try{await api("/settings","POST",{kind:"school_theme",theme});me.school_theme=theme;setSchoolTheme(theme);cache={};toast(`Tema ${schoolThemeOptions.find(option=>option.value===theme)?.label||"institucional"} aplicado para la escuela`);await loadPage()}catch(error){document.querySelectorAll("[data-school-theme-choice]").forEach(option=>{option.disabled=false;option.removeAttribute("aria-busy")});toast(error.message)}});
  document.querySelectorAll("[data-setting]").forEach(x=>x.onclick=()=>settingForm(x.dataset.setting));
  document.querySelectorAll("[data-period-config]").forEach(x=>x.onclick=()=>settingForm("period",x.dataset.periodConfig));
  document.querySelectorAll("[data-curriculum]").forEach(x=>x.onclick=()=>({year:planYearForm,section:sectionForm,offering:offeringForm}[x.dataset.curriculum])());
  document.querySelectorAll("[data-enroll]").forEach(x=>x.onclick=()=>enrollmentForm(Number(x.dataset.enroll)));
  document.querySelectorAll("[data-school-state]").forEach(x=>x.onclick=async()=>{try{await api(`/schools/${x.dataset.schoolState}/state`,"PATCH",{state:x.dataset.state});cache={};loadPage()}catch(e){toast(e.message)}});
  document.querySelectorAll("[data-period]").forEach(x=>x.onclick=()=>{document.querySelectorAll("[data-period]").forEach(y=>y.classList.remove("selected"));x.classList.add("selected");document.querySelectorAll("tbody tr[data-search]").forEach(y=>y.style.display=y.dataset.search.includes(x.dataset.period.toLowerCase())?"":"none")});
  document.querySelectorAll("[data-analytics-filter]").forEach(control=>control.onchange=()=>{
    const key=control.dataset.analyticsFilter;
    if(key==="year")analyticsFilters={year:Number(control.value)||new Date().getFullYear()};
    else analyticsFilters[key]=control.value||null;
    loadPage();
  });
}

function downloadTemplate(format){const resource=$("#import-resource").value;window.location=`/api/v1/imports/templates/?resource=${encodeURIComponent(resource)}&format=${format}`}
async function downloadCsv(){window.location="/api/v1/exports/students/";}

async function importCsv(e){
  const file=e.target.files?.[0]; if(!file)return;
  const form=new FormData();form.append("file",file);form.append("resource",$("#import-resource")?.value||"students");
  try{
    const response=await fetch("/api/v1/imports/preview/",{method:"POST",headers:{"X-CSRFToken":csrfToken()},body:form});
    const preview=await response.json(); if(!response.ok)throw Error(preview.error||"No se pudo validar la planilla.");
    const errorMap=new Map(preview.errors.map(x=>[x.row,x.messages]));
    const previewRows=preview.preview.map((row,i)=>{const rowNumber=i+2;return `<tr><td>${rowNumber}</td><td>${h(Object.values(row).join(" · "))}</td><td>${h((errorMap.get(rowNumber)||[]).join(" ")||"Lista para importar")}</td></tr>`}).join("");
    const errors=preview.errors.map(x=>`<li><b>Fila ${x.row}:</b> ${h(x.messages.join(" "))}</li>`).join("");
    modal("Revisar importación",`<p class="form-intro">${preview.valid_rows} filas válidas de ${preview.rows}. Las filas con errores se omitirán; corregilas en el archivo y volvé a cargarlo.</p><div class="card table-card import-preview"><table><thead><tr><th>FILA</th><th>DATOS</th><th>VALIDACIÓN</th></tr></thead><tbody>${previewRows||"<tr><td colspan=3>La planilla no contiene registros.</td></tr>"}</tbody></table></div>${errors?`<ul class="import-errors">${errors}</ul>`:""}`,"Importar filas válidas",async()=>{
      if(!preview.valid_rows)throw Error("No hay filas válidas para importar.");
      const result=await api(`/imports/${preview.batch_id}/commit`,"POST",{});
      cache={};
      return {message:`${result.created} registros importados${result.skipped?` · ${result.skipped} omitidos`:""}`};
    });
  }catch(err){toast(err.message)}finally{e.target.value="";}
}

permissions.docente.push("Asistencia");

async function attendancePage(){
  const [rows,students,offerings]=await Promise.all([api("/attendance"),api("/students"),api("/offerings")]);
  const teacher=me.role==="docente";
  const offeringOptions=offerings.map((o,i)=>`<option value="${o.id}" data-section="${o.section.id}" ${i===0?"selected":""}>${h(o.subject)} · ${h(o.section.name)} (${h(o.kind==="workshop"?"Taller":"Materia")})</option>`).join("");
  return `<div class="summary-strip"><div><b>${teacher?"Asistencia por clase o taller":"Asistencia diaria"}</b><small>${teacher?"Solo para materias y comisiones que tenés asignadas.":"Tomada para el día seleccionado."}</small></div><label class="date-control"><span>Fecha</span><input type="date" id="attendance-date" value="${today()}"></label>${teacher?`<label class="date-control"><span>Materia / taller</span><select id="attendance-offering" onchange="applyOfferingAttendance()">${offeringOptions}</select></label>`:""}</div><div class="card table-card"><table><thead><tr><th>ALUMNO</th><th>CURSO</th><th>INSTANCIA</th><th>FECHA</th><th>ESTADO</th><th>OBSERVACIÓN</th></tr></thead><tbody>${rows.map(a=>`<tr><td><b>${h(a.student)}</b></td><td>${h(a.course)} ${h(a.division)}</td><td>${h(a.offering)}</td><td>${fmt(a.date)}</td><td>${status(a.status)}</td><td>${h(a.note||"—")}</td></tr>`).join("")}</tbody></table>${!rows.length?empty("Todavía no se registró asistencia."):""}</div><div class="card roster-card"><div class="panel-head"><div><h3>Pasar asistencia</h3><p>${teacher?"Se guardará para la materia/taller seleccionado.":"Registrá el estado de cada alumno para la fecha seleccionada."}</p></div></div><div class="roster-list">${students.map(s=>`<div class="roster-row" data-section="${s.section_id||""}"><span class="avatar avatar-small">${initials(s.name)}</span><b>${h(s.name)}</b><small>${h(s.course)} ${h(s.division)}</small><select data-attendance="${s.id}"><option>Presente</option><option>Ausente</option><option>Tarde</option><option>Justificado</option></select></div>`).join("")}</div><button class="button primary" id="save-attendance">Guardar asistencia</button></div>`;
}

function applyOfferingAttendance(){
  const section=$("#attendance-offering")?.selectedOptions[0]?.dataset.section;
  document.querySelectorAll(".roster-row[data-section]").forEach(row=>row.hidden=Boolean(section&&row.dataset.section!==section));
}

async function attendanceForm(){
  const [students,offerings]=await Promise.all([api("/students"),api("/offerings")]);
  const offeringField=me.role==="docente"?field("Materia o taller","offering_id","select",{options:offerings.map(o=>({value:o.id,label:`${o.subject} · ${o.section.name}`}))}):"";
  modal("Pasar asistencia",`${field("Alumno/a","student_id","select",{options:students.map(x=>({value:x.id,label:`${x.name} · ${x.course} ${x.division}`}))})}${offeringField}${field("Fecha","date","date",{value:today()})}${field("Estado","status","select",{options:["Presente","Ausente","Tarde","Justificado"].map(x=>({value:x,label:x}))})}<label>Observación <textarea name="note" rows="3" placeholder="Opcional"></textarea></label>`,"Guardar asistencia",async v=>{if(v.offering_id)v.offering_id=Number(v.offering_id);await api("/attendance","POST",v);});
}

async function saveAttendance(){
  const date=$("#attendance-date").value;
  const offering=$("#attendance-offering")?.value;
  const selected=Array.from(document.querySelectorAll("[data-attendance]")).filter(el=>!el.closest(".roster-row")?.hidden);
  try{
    if(!selected.length)throw Error("No hay alumnos de esa comisión para registrar.");
    const records=selected.map(el=>{const row={student_id:Number(el.dataset.attendance),date,status:el.value};if(offering)row.offering_id=Number(offering);return row;});
    await api("/attendance","POST",{records});
    toast("Asistencia guardada");cache={};loadPage();
  }catch(e){toast(e.message)}
}

async function api(path,method="GET",data){
  const headers={"Content-Type":"application/json"};
  if(!["GET","HEAD","OPTIONS"].includes(method.toUpperCase()))headers["X-CSRFToken"]=csrfToken();
  const [raw,query=""]=path.split("?"),suffix=raw.endsWith("/")?raw:`${raw}/`;
  const response=await fetch("/api/v1"+suffix+(query?`?${query}`:""),{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
  let body={};
  try{body=await response.json()}catch{}
  if(response.status===401||(response.status===403&&!(response.headers.get("content-type")||"").includes("application/json"))){
    if(!path.includes("/auth/login")){me=null;login();throw Error("La sesión venció o necesita volver a validarse. Iniciá sesión nuevamente.")}
  }
  if(!response.ok)throw Error(body.error||"No se pudo completar la acción");
  return body;
}


async function enrollmentForm(studentId){
  const sections=await api("/sections");
  modal("Inscribir en una comisión",`${field("Comisión","section_id","select",{options:sections.map(s=>({value:s.id,label:`${s.name} · ${s.academic_year}`}))})}${field("Ciclo lectivo","academic_year","number",{value:new Date().getFullYear(),min:2000,max:2100})}`,"Guardar inscripción",async v=>{v.student_id=studentId;v.section_id=Number(v.section_id);v.academic_year=Number(v.academic_year);await api("/enrollments","POST",v);});
}
start();

async function attachFollowup(){
  try{
    const data=await api("/academic-followup");
    if(page!=="Inicio"||!$("#view"))return;
    const rows=(items,render)=>items.slice(0,8).map(render).join("");
    const absences=rows(data.absences,item=>`<div class="followup-row"><b>${h(item.student)}</b><span>${item.days} día(s) con inasistencia</span></div>`);
    const pending=rows(data.pending_grades,item=>`<div class="followup-row"><b>${h(item.student)}</b><span>${h(item.subject)} · ${h(item.period)}</span></div>`);
    const panel=document.createElement("div");
    panel.className="followup-grid";
    panel.innerHTML=`<section class="card followup-card"><div class="panel-head"><div><h3>Inasistencias del ciclo</h3><p>${data.year} · días con inasistencia registrados</p></div><strong>${data.absence_count}</strong></div><div class="followup-list">${absences||empty("No hay inasistencias registradas.")}</div></section><section class="card followup-card"><div class="panel-head"><div><h3>Calificaciones pendientes</h3><p>${h(data.period||"Período vigente")}</p></div><strong>${data.pending_grade_count}</strong></div><div class="followup-list">${pending||empty(data.period?"No hay calificaciones pendientes.":"Configurá las fechas del período vigente para ver pendientes.")}</div></section>`;
    $("#view").append(panel);
  }catch(error){console.warn("No se pudo cargar el seguimiento académico",error)}
}

async function noticesPage(){
  const rows=await get("/notices"), family=["alumno","tutor"].includes(me.role);
  return `<div class="notice-banner"><span>◉</span><div><b>Una comunidad bien informada</b><p>${family?"Marcá los avisos que ya leíste para tenerlos ubicados.":"Novedades, recordatorios y fechas importantes de la escuela."}</p></div></div><div class="notice-feed">${rows.map((notice,index)=>`<article class="card notice-card ${notice.is_read?"notice-read":""}"><div class="notice-date"><span class="month">${new Intl.DateTimeFormat("es-AR",{month:"short"}).format(new Date(notice.created_at+"T12:00:00")).toUpperCase()}</span><b>${new Date(notice.created_at+"T12:00:00").getDate()}</b></div><div class="notice-body"><div class="notice-tags"><span class="audience-tag">${h(notice.audience)}</span><span>${fmt(notice.created_at)}</span></div><h3>${h(notice.title)}</h3><p>${h(notice.body)}</p></div>${family?(notice.is_read?'<span class="read-label">Leído</span>':`<button class="button secondary small notice-read-button" data-read-notice="${notice.id}">Marcar leído</button>`):`<span class="notice-index">${String(index+1).padStart(2,"0")}</span>`}</article>`).join("")}${!rows.length?empty("Todavía no hay avisos."):""}</div>`;
}

async function calendarPage(){
  const events=await get("/events"), canManage=["school_admin","directivo","secretaria","preceptor"].includes(me.role);
  return `<div class="notice-banner"><span>▦</span><div><b>Agenda escolar</b><p>Próximas actividades para la comunidad de ${h(me.school_name)}.</p></div>${canManage?'<button class="button primary" data-new-event>＋ Nuevo evento</button>':""}</div><div class="event-list">${events.map(event=>`<article class="card event-card"><div class="event-date"><b>${new Intl.DateTimeFormat("es-AR",{day:"2-digit"}).format(new Date(event.starts_at))}</b><span>${new Intl.DateTimeFormat("es-AR",{month:"short"}).format(new Date(event.starts_at)).toUpperCase()}</span></div><div class="event-body"><div class="notice-tags"><span class="audience-tag">${h(event.audience)}</span><span>${new Intl.DateTimeFormat("es-AR",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"}).format(new Date(event.starts_at))}</span></div><h3>${h(event.title)}</h3><p>${h(event.description||"Sin detalles adicionales.")}</p></div>${canManage?`<button class="text-button" data-event-delete="${event.id}" aria-label="Eliminar ${h(event.title)}">Eliminar</button>`:""}</article>`).join("")}${!events.length?empty("No hay eventos próximos publicados."):""}</div>`;
}


function helpCenterPage(){
  const available=new Set(permissions[me.role]||[]);
  const analyticsRoles=["school_admin","directivo","secretaria","preceptor"];
  if(me.analytics_enabled&&analyticsRoles.includes(me.role))available.add("Estadísticas");
  const guides=[
    {title:"Tomar asistencia",icon:"✓",audience:"Docentes, preceptoría y gestión",destination:"Asistencia",visual:"attendance",goal:"Dejá asentado quién asistió, quién llegó tarde y quién tuvo una ausencia justificada para una fecha.",before:"Si sos docente, vas a ver la comisión de la materia o taller que tenés asignado. El equipo de gestión registra la asistencia diaria.",steps:[["Elegí la fecha","En el campo Fecha, seleccioná el día de la clase. La lista muestra también los registros que ya existen para esa jornada."],["Marcá a cada estudiante","En la lista Pasar asistencia, elegí Presente, Ausente, Tarde o Justificado. Revisá el nombre y el curso antes de marcar para evitar cargar el estado en el estudiante equivocado."],["Guardá el registro","Presioná Guardar asistencia una vez que terminaste con toda la lista. El estado queda registrado para el día seleccionado."]],tip:"Si elegís una fecha distinta, volvé a revisar la lista antes de guardar. En la cuenta docente, la selección de materia o taller limita qué comisión aparece."},
    {title:"Cargar una calificación",icon:"✳",audience:"Docentes y equipo de gestión autorizado",destination:"Calificaciones",visual:"grades",roles:["school_admin","directivo","docente"],goal:"Registrá una nota con el alumno, el espacio curricular y el período correctos.",before:"Tené definido el período al que corresponde la nota. La escala válida la configura la escuela en Configuración.",steps:[["Abrí el formulario","En Calificaciones, elegí Cargar nota. Se abre un formulario con los datos que identifican el registro."],["Completá alumno, materia y período","Revisá el nombre y el curso del alumno, elegí la materia o taller y el período que corresponden. Estos datos determinan en qué fila y columna aparecerá en el boletín."],["Ingresá y guardá la nota","Cargá un valor dentro de la escala de tu escuela. La observación es opcional. Presioná Guardar; luego podés consultar el resultado en Boletines."]],tip:"Si falta una materia, comisión o período en las opciones, pedí a dirección que revise la configuración y las asignaciones."},
    {title:"Ver y descargar un boletín",icon:"▤",audience:"Estudiantes, familias y personal habilitado",destination:"Boletines",visual:"report-card",goal:"Consultá el boletín de un alumno y descargalo como PDF para guardarlo o imprimirlo.",before:"Las cuentas de familias y estudiantes solo muestran el alumno o los alumnos vinculados a esa cuenta. El personal puede ver los perfiles habilitados para su rol.",steps:[["Elegí el alumno","En Alumno/a, seleccioná el nombre que querés consultar. Si tu cuenta familiar tiene más de un estudiante vinculado, cada uno aparece en esta lista."],["Elegí el ciclo lectivo","En Ciclo lectivo, elegí el año de la inscripción que querés revisar. La opción también indica el curso y la división de ese año."],["Revisá y descargá","La vista previa muestra las áreas curriculares, los informes y la asistencia. Presioná Descargar boletín PDF para obtener el archivo del alumno y ciclo seleccionados."]],tip:"Un guion en días hábiles o inasistencias suele indicar que faltan las fechas de inicio y cierre del período. Secretaría o dirección puede configurarlas en Configuración."},
    {title:"Leer y confirmar un aviso",icon:"◉",audience:"Toda la comunidad escolar",destination:"Avisos",visual:"notices",goal:"Leé novedades y, desde una cuenta de estudiante o tutor, confirmá que ya viste el aviso.",before:"La etiqueta de destinatarios indica para quién se publicó cada mensaje. Solo aparecen avisos dirigidos a tu cuenta.",steps:[["Abrí el aviso","Entrá en Avisos y leé el título, el mensaje y a quién está dirigido."],["Marcá como leído","En una cuenta de estudiante o tutor, presioná Marcar leído debajo del aviso. El botón cambia a Leído cuando queda registrado."],["Publicá si tenés permiso","Administración, dirección, Secretaría y preceptoría pueden usar Nuevo aviso. Completá el título, elegí destinatarios y escribí el mensaje antes de publicar."]],tip:"La confirmación queda asociada a la cuenta que leyó el aviso. Si gestionás varios estudiantes, cada familiar debe entrar con su propia cuenta vinculada."},
    {title:"Consultar el calendario escolar",icon:"▦",audience:"Toda la comunidad; edición para gestión",destination:"Calendario",goal:"Encontrá fechas y horarios de actividades dirigidas a la comunidad o a un grupo específico.",before:"La audiencia del evento te indica si está dirigido a todos, familias, alumnos, docentes o personal.",steps:[["Revisá la agenda","Abrí Calendario y recorré los eventos publicados. Cada ficha muestra fecha, hora, título, descripción y destinatarios."],["Abrí los detalles","Leé la descripción para conocer el lugar o las indicaciones que haya agregado la escuela."],["Publicá si estás autorizado","Administración, dirección, Secretaría y preceptoría pueden crear un evento con Nuevo evento. Completá el título, el inicio, la audiencia y los detalles; el fin es opcional."]],tip:"Si no ves una actividad esperada, confirmá con la escuela que se haya publicado y que el evento esté dirigido a tu grupo."},
    {title:"Buscar un libro o revisar un préstamo",icon:"▣",audience:"Toda la comunidad; gestión según permisos",destination:"Biblioteca",goal:"Buscá títulos disponibles y consultá los préstamos y sus fechas de devolución.",before:"La disponibilidad muestra cuántos ejemplares se pueden prestar. Las acciones para registrar préstamos, devoluciones o títulos nuevos dependen de tu perfil.",steps:[["Buscá en el catálogo","Usá el campo Buscar título o autor para filtrar los libros. Revisá la cantidad disponible y el total de ejemplares."],["Consultá el préstamo","En Préstamos y devoluciones, buscá el libro o alumno y comprobá la fecha de retiro, el vencimiento y el estado."],["Registrá una acción si tenés permiso","El personal autorizado puede registrar un préstamo o devolución desde la sección Biblioteca. Confirmá el alumno, el libro y la fecha antes de guardar."]],tip:"Si un título figura sin disponibilidad, consultá con Biblioteca para conocer cuándo vuelve a estar disponible."},
    {title:"Revisar o reclamar un objeto perdido",icon:"⌕",audience:"Comunidad escolar; gestión según permisos",destination:"Objetos perdidos",goal:"Consultá lo encontrado y avisá a la escuela si reconocés un objeto.",before:"Las publicaciones muestran descripción, lugar y fecha. El reclamo está disponible para las cuentas de alumnos cuando el objeto sigue publicado.",steps:[["Buscá el objeto","Entrá en Objetos perdidos y usá el buscador para encontrarlo por nombre o descripción."],["Comprobá sus detalles","Revisá el lugar donde se encontró, la fecha y las características publicadas."],["Enviá el reclamo","Si sos alumno y lo reconocés, elegí Lo reclamo y agregá un detalle que ayude a identificarlo. Preceptoría coordina la devolución."]],tip:"No publiques datos personales en la descripción del reclamo; alcanza con mencionar una característica que permita verificar que el objeto es tuyo."},
    {title:"Importar alumnos desde una planilla",icon:"⇧",audience:"Administración, dirección y Secretaría",destination:"Alumnos",roles:["school_admin","directivo","secretaria"],goal:"Cargá varios registros de una vez desde un archivo CSV o XLSX.",before:"Antes de importar, descargá la plantilla que corresponda y completá sus columnas. Revisá que nombres, cursos y divisiones estén escritos de forma consistente.",steps:[["Elegí el tipo de plantilla","En Alumnos, descargá Plantilla CSV o Plantilla Excel. Si el selector de recurso está visible, confirmá que diga Alumnos."],["Completá y guardá el archivo","Ingresá un alumno por fila y conservá los encabezados de la plantilla. Guardá el archivo como CSV o XLSX."],["Revisá la vista previa","Después de elegir el archivo, comprobá el total de filas válidas y leé los mensajes de validación. Las filas con errores se van a omitir."],["Confirmá la importación","Presioná Importar filas válidas para guardar las filas correctas. Si hubo errores, corregí la planilla y volvé a cargarla para incorporar las filas pendientes."]],tip:"Hacé una copia de seguridad del archivo original. Si hay filas con datos incompletos, corregilas en la planilla y volvé a importarlas después de revisar el mensaje de resultado."},
    {title:"Configurar períodos y cuentas",icon:"⚙",audience:"Administración escolar y dirección",destination:"Configuración",roles:["school_admin","directivo"],goal:"Prepará los períodos para que las notas y la asistencia aparezcan en la columna correcta del boletín, y administrá los accesos de la comunidad.",before:"Antes de empezar el ciclo lectivo, reuní los nombres y fechas de cada período y las direcciones de correo de las personas que vas a invitar.",steps:[["Revisá cursos y materias","En Configuración, comprobá que los cursos y materias de la escuela estén disponibles."],["Definí cada período","Agregá o abrí un período, elegí el año, el orden y la columna del boletín. Cargá juntas las fechas de inicio y cierre para calcular días hábiles e inasistencias."],["Invitá a cada persona","En Cuentas y permisos, elegí Crear cuenta, completá nombre, correo y rol. Para alumno o tutor, vinculá los perfiles de estudiante que correspondan."]],tip:"La selección de rol determina qué secciones puede ver cada cuenta. Verificá el perfil y los alumnos vinculados antes de enviar la invitación."},
    {title:"Leer las estadísticas académicas",icon:"▥",audience:"Perfiles autorizados con plan Pro",destination:"Estadísticas",visual:"analytics",roles:analyticsRoles,pro:true,goal:"Explorá promedios, distribución de notas, aprobación y evolución con filtros por ciclo, período, salón y materia.",before:"El tablero usa las notas cargadas. Las notas faltantes no se incluyen y la aprobación se calcula con la escala definida por la escuela.",steps:[["Elegí el alcance","Seleccioná el ciclo lectivo y, si querés, un período. Podés dejar otros filtros sin cambios para ver el conjunto disponible."],["Acotá la comparación","Filtrá por salón o materia para comparar grupos y espacios curriculares dentro de la escuela."],["Leé los resultados","Revisá los indicadores generales, la distribución, la evolución y las tablas por alumno y materia. Los promedios son simples sobre las notas existentes."]],tip:"Un resultado vacío puede deberse a que todavía no se cargaron notas en el ciclo, período, salón o materia seleccionados."}
  ].filter(guide=>available.has(guide.destination)&&(!guide.roles||guide.roles.includes(me.role))&&(!guide.pro||Boolean(me.analytics_enabled)));
  const faqs=[
    ["¿Por qué no veo una sección o un botón?","Cada perfil tiene permisos distintos. Algunas opciones también dependen de que tengas materias asignadas o de que tu cuenta esté vinculada a los estudiantes correctos. Pedile a la administración escolar que revise tu rol y tus vínculos."],
    ["¿Cómo busco ayuda más rápido?","Escribí una palabra en el buscador, por ejemplo ‘boletín’, ‘asistencia’ o ‘familia’. Se filtrarán las guías y las preguntas frecuentes relacionadas."],
    ["¿Por qué no aparece una nota en el boletín?","Confirmá que elegiste el alumno y ciclo lectivo correctos. El boletín muestra las notas que ya cargaron los docentes para ese alumno y período. Si sigue faltando, consultá al docente o a Secretaría."],
    ["¿Qué significan los guiones en días hábiles e inasistencias?","El guion indica que no hay un cálculo disponible para ese período. Dirección o Secretaría debe cargar las fechas de inicio y cierre en Configuración; después se puede volver a descargar el boletín."],
    ["¿Cómo descarga una familia el boletín de cada hijo?","Entrá en Boletines y elegí un alumno vinculado. Descargá el PDF; luego repetí la selección para el otro estudiante. Cada cuenta familiar solo puede ver los perfiles vinculados a ella."],
    ["¿Qué pasa cuando marco un aviso como leído?","Nexo guarda la confirmación para la cuenta que lo marcó. El aviso queda identificado como Leído en esa cuenta."],
    ["¿Por qué no aparece Estadísticas?","Estadísticas requiere plan Pro activo y un perfil habilitado: administración, dirección, Secretaría o preceptoría. Si el perfil es correcto, consultá a la administración de la escuela para revisar el plan."],
    ["¿A quién consulto si una guía no resuelve mi problema?","Para permisos, inscripciones y datos escolares, contactá a Secretaría o a la administración de tu escuela. Indicá el nombre de la sección y el ciclo lectivo que estabas consultando."]
  ];
  return `<div class="help-center"><section class="help-center-hero"><div><span class="eyebrow green">CENTRO DE AYUDA</span><h2>Aprendé a usar Nexo paso a paso</h2><p>Guías claras para las tareas escolares, vistas de referencia para ubicar los controles y respuestas a las dudas comunes.</p></div><div class="help-hero-mark" aria-hidden="true">?</div></section><div class="help-search-wrap"><label class="help-search"><span aria-hidden="true">⌕</span><input id="help-search" type="search" aria-label="Buscar en el Centro de ayuda" placeholder="Buscar una guía o pregunta, por ejemplo: boletín"></label><p>Las guías aparecen según las secciones habilitadas para tu perfil.</p></div><div class="help-section-heading"><div><h2>Guías para ${h(roleNames[me.role]||"tu perfil")}</h2><p>Abrí un tema para ver qué necesitás, cada paso y un acceso directo a la sección.</p></div><span class="help-guide-count">${guides.length} tutoriales</span></div><div class="help-guide-grid">${guides.map((guide,index)=>`<details class="card help-guide-card" data-help-searchable ${index===0?"open":""}><summary class="help-guide-summary"><span class="help-guide-icon">${guide.icon}</span><span class="help-guide-title-wrap"><b>${h(guide.title)}</b><small>${h(guide.audience)}</small></span><span class="help-guide-toggle" aria-hidden="true">＋</span></summary><div class="help-guide-body"><div class="help-guide-intro"><b>Qué vas a lograr</b><p>${h(guide.goal)}</p></div><div class="help-guide-before"><b>Antes de empezar</b><p>${h(guide.before)}</p></div><ol class="help-guide-steps">${guide.steps.map(([title,detail],stepIndex)=>`<li><span class="help-step-number">${stepIndex+1}</span><div><b>${h(title)}</b><p>${h(detail)}</p></div></li>`).join("")}</ol>${guide.visual?`<figure class="help-guide-visual"><img src="${staticRoot}images/help/${h(guide.visual)}.svg" alt="Vista ilustrada de ${h(guide.title)} con los controles numerados" loading="lazy"><figcaption>Vista ilustrada de Nexo. Los números señalan los controles descritos en los pasos.</figcaption></figure>`:""}<div class="help-guide-tip"><b>Consejo</b><p>${h(guide.tip)}</p></div><button type="button" class="button secondary help-guide-link" data-go="${h(guide.destination)}">Abrir ${h(guide.destination)} <span>↗</span></button></div></details>`).join("")}</div><p class="help-search-empty" id="help-search-empty" hidden>No encontramos guías o preguntas que coincidan. Probá con otra palabra.</p><section class="help-faq-section"><div class="help-section-heading"><div><h2>Preguntas frecuentes</h2><p>Respuestas cortas para resolver los problemas más comunes.</p></div></div><div class="help-faq-list">${faqs.map(([question,answer])=>`<details class="card help-faq-item" data-help-searchable><summary>${h(question)}<span aria-hidden="true">＋</span></summary><p>${h(answer)}</p></details>`).join("")}</div></section><section class="help-contact card"><span class="help-contact-icon">✦</span><div><h3>¿Todavía necesitás ayuda?</h3><p>Consultá a Secretaría o a la administración de tu escuela. Para que puedan ayudarte rápido, deciles qué sección abriste, qué estabas intentando hacer y qué mensaje apareció.</p></div><button type="button" class="button secondary" data-go="Inicio">Volver al inicio</button></section></div>`;
}

function eventForm(){
  const start=new Date();
  start.setMinutes(start.getMinutes()-start.getTimezoneOffset());
  const end=new Date(start.getTime()+60*60*1000);
  const body=`${field("Nombre del evento","title")}${field("Inicio","starts_at","datetime-local",{value:start.toISOString().slice(0,16)})}${field("Fin (opcional)","ends_at","datetime-local",{required:false,value:end.toISOString().slice(0,16)})}${field("Destinatarios","audience","select",{options:["Todos","Alumnos","Familias","Docentes","Personal"].map(value=>({value,label:value}))})}<label>Descripción <textarea name="description" rows="3"></textarea></label>`;
  modal("Nuevo evento escolar",body,"Publicar evento",values=>api("/events","POST",values));
}

document.addEventListener("click",async event=>{
  const readButton=event.target.closest?.("[data-read-notice]");
  if(readButton){
    readButton.disabled=true;
    try{await api(`/notices/${readButton.dataset.readNotice}/read`,"POST",{});cache={};await loadPage()}
    catch(error){readButton.disabled=false;toast(error.message)}
    return;
  }
  if(event.target.closest?.("[data-new-event]")){eventForm();return}
  const deleteButton=event.target.closest?.("[data-event-delete]");
  if(deleteButton){
    if(!window.confirm("¿Eliminar este evento del calendario?"))return;
    try{await api(`/events/${deleteButton.dataset.eventDelete}`,"DELETE");cache={};await loadPage();toast("Evento eliminado.")}
    catch(error){toast(error.message)}
  }
});
