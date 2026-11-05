import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  LayoutDashboard, Monitor, ClipboardList, QrCode, Settings, Search,
  Plus, CheckCircle2, AlertTriangle, Wrench, Menu, X, LogOut,
  ArrowUpRight, Bot, MapPin, Package, Clock, ChevronRight
} from 'lucide-react'
import './style.css'

const API = '/api'

function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token')
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

function PublicEquipmentPage({ equipmentId }) {
  const [item, setItem] = useState(null)
  const [error, setError] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Не определена')
  const [sent, setSent] = useState(false)
  useEffect(() => {
    fetch(`${API}/equipment/${equipmentId}`).then(async r => {
      if (!r.ok) throw new Error('Оборудование по этому QR-коду не найдено')
      setItem(await r.json())
    }).catch(e => setError(e.message || 'Не удалось загрузить карточку'))
  }, [equipmentId])
  async function submitTicket(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/tickets`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({equipment_id:Number(equipmentId), description, category}) })
    if (!res.ok) { setError('Не удалось создать заявку. Попробуйте позже.'); return }
    setSent(true)
  }
  return <div className="login-page"><div className="login-card">
    <div className="brand-mark"><Package/></div><h1>Карточка оборудования</h1>
    {error && <div className="notice">{error}</div>}
    {!item && !error && <p>Загрузка карточки…</p>}
    {item && <><h2>{item.name}</h2><p>Инвентарный номер: {item.inventory_number}</p><p>Тип: {item.type}</p><p>Расположение: {item.location || `Кабинет ${item.room}`}</p><p>Состояние: {item.status}</p><p>Характеристики: {item.characteristics || 'Не указаны'}</p>
      {!sent ? <form className="stack-form" onSubmit={submitTicket}><h3>Сообщить о неисправности</h3><label>Категория<select value={category} onChange={e=>setCategory(e.target.value)}><option>Не определена</option><option>Компьютер</option><option>Принтер</option><option>Проектор</option><option>Сеть</option><option>Другое</option></select></label><label>Описание проблемы<textarea required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Опишите проблему"/></label><button className="primary full">Отправить заявку</button></form> : <div className="notice">Заявка создана. Спасибо!</div>}
    </>}
  </div></div>
}

function Root() {
  const params = new URLSearchParams(window.location.search)
  const equipmentId = params.get('equipment')

  if (equipmentId && /^\d+$/.test(equipmentId)) {
    return <PublicEquipmentPage equipmentId={equipmentId} />
  }
  if (equipmentId) return <div className="login-page"><div className="login-card"><h1>Некорректный QR-код</h1><p>В ссылке указан неверный идентификатор оборудования.</p></div></div>

  return <App />
}

function App() {
  const [page, setPage] = useState('dashboard')
  const [equipment, setEquipment] = useState([])
  const [tickets, setTickets] = useState([])
  const [stats, setStats] = useState({})
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [login, setLogin] = useState(localStorage.getItem('token') ? true : false)
  const [role, setRole] = useState(localStorage.getItem('role') || 'admin')
  const [loginForm, setLoginForm] = useState({login:'admin',password:'admin123'})
  const [form, setForm] = useState({name:'',inventory_number:'',type:'Компьютер',characteristics:'',status:'Исправно',room:'214',building:'Главный корпус',floor:'1'})
  const [editForm, setEditForm] = useState({})
  const [ticketForm, setTicketForm] = useState({equipment_id:'',description:'',category:'Не определена'})
  const [aiText, setAiText] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [notice, setNotice] = useState('')
  const [checkedInventory, setCheckedInventory] = useState([])
  const [rooms, setRooms] = useState([])
  const [users, setUsers] = useState([])

  async function load() {
    try {
      const [er, tr, sr, rr, ur] = await Promise.all([
        apiFetch(`${API}/equipment`), apiFetch(`${API}/tickets`), apiFetch(`${API}/stats`),
        apiFetch(`${API}/rooms`), apiFetch(`${API}/users`)
      ])
      if ([er, tr, sr].some(r => r.status === 401)) {
        localStorage.removeItem('token'); localStorage.removeItem('role'); setLogin(false); setNotice('Войдите в систему снова'); return
      }
      if (![er, tr, sr].every(r => r.ok)) throw new Error('API error')
      const [e,t,s] = await Promise.all([er.json(),tr.json(),sr.json()])
      setEquipment(Array.isArray(e) ? e : []); setTickets(Array.isArray(t) ? t : []); setStats(s)
      if (rr.ok) setRooms(await rr.json())
      if (ur.ok) setUsers(await ur.json())
      const checksRes = await apiFetch(`${API}/inventory/checks`)
      if (checksRes.ok) {
        const checks = await checksRes.json()
        setCheckedInventory(Array.isArray(checks) ? checks : [])
      }
    } catch {
      setNotice('Не удалось подключиться к серверу. Проверь, запущен ли backend.')
    }
  }
  useEffect(()=>{ if (login) load() }, [login])

  async function doLogin(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(loginForm)})
    if (!res.ok) { setNotice('Неверный логин или пароль'); return }
    const data = await res.json()
    localStorage.setItem('token',data.access_token)
    localStorage.setItem('role',data.role || 'employee')
    setRole(data.role || 'employee')
    setLogin(true); setNotice('Вход выполнен')
  }

  async function addEquipment(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/equipment`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    if (!res.ok) {
      const data = await res.json().catch(()=>({}))
      setNotice(data.detail || 'Не удалось добавить оборудование'); return
    }
    setShowAdd(false); setForm({name:'',inventory_number:'',type:'Компьютер',characteristics:'',status:'Исправно',room:'214',building:'Главный корпус',floor:'1'})
    await load(); setNotice('Оборудование добавлено')
  }

  async function saveEquipmentEdit(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/equipment/${editing.id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(editForm)})
    if (!res.ok) { const d = await res.json().catch(()=>({})); setNotice(d.detail || 'Не удалось сохранить изменения'); return }
    setEditing(null); setSelected(null); await load(); setNotice('Данные оборудования обновлены')
  }

  async function createTicket(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/tickets`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ticketForm)})
    if (!res.ok) { setNotice('Не удалось создать заявку'); return }
    setTicketForm({equipment_id:'',description:'',category:'Не определена'})
    await load(); setNotice('Заявка создана')
  }

  async function updateTicket(id,status,comment='',assigned_to) {
    const payload = {status,comment}
    if (assigned_to !== undefined) payload.assigned_to = assigned_to
    const res = await apiFetch(`${API}/tickets/${id}`, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    if (!res.ok) { setNotice('Не удалось обновить заявку'); return }
    await load(); setNotice('Заявка обновлена')
  }

  async function diagnose(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/ai/diagnose?text=${encodeURIComponent(aiText)}`)
    setAiResult(await res.json())
  }

  async function checkInventory(id) {
    const res = await apiFetch(`${API}/inventory/${id}/check`,{method:'POST'})
    if (res.ok) { const checksRes = await apiFetch(`${API}/inventory/checks`); if (checksRes.ok) setCheckedInventory(await checksRes.json()) }
    else setNotice('Не удалось сохранить отметку инвентаризации')
  }

  async function cancelInventoryCheck(id) {
    const res = await apiFetch(`${API}/inventory/${id}/check`,{method:'DELETE'})
    if (res.ok) { const checksRes = await apiFetch(`${API}/inventory/checks`); if (checksRes.ok) setCheckedInventory(await checksRes.json()) }
    else setNotice('Не удалось отменить отметку инвентаризации')
  }

  const filtered = equipment.filter(x => `${x.name} ${x.inventory_number}`.toLowerCase().includes(search.toLowerCase()) && (!typeFilter || x.type===typeFilter) && (!roomFilter || x.room===roomFilter))
  const nav = [
    {id:'dashboard',label:'Главная',icon:LayoutDashboard},
    {id:'equipment',label:'Оборудование',icon:Monitor},
    {id:'tickets',label:'Заявки',icon:ClipboardList},
    {id:'rooms',label:'Кабинеты',icon:MapPin},
    {id:'inventory',label:'Инвентаризация',icon:QrCode},
    {id:'assistant',label:'ИИ-помощник',icon:Bot},
    ...(role === 'admin' ? [{id:'users',label:'Пользователи',icon:Settings}] : []),
  ]

  if (!login) return <div className="login-page"><form className="login-card" onSubmit={doLogin}>
    <div className="brand-mark"><Package/></div><h1>ДГУ Инвентарь</h1><p>Войдите в панель управления</p>
    <label>Логин<input value={loginForm.login} onChange={e=>setLoginForm({...loginForm,login:e.target.value})}/></label>
    <label>Пароль<input type="password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm,password:e.target.value})}/></label>
    <button className="primary full">Войти</button><small>Демо: admin / admin123</small>
    {notice && <div className="notice">{notice}</div>}
  </form></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Package/></div><div><b>ДГУ Инвентарь</b><small>Учет оборудования</small></div></div>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      {nav.map(item=><button key={item.id} className={`nav-item ${page===item.id?'active':''}`} onClick={()=>{setPage(item.id);setSelected(null)}}><item.icon size={18}/><span>{item.label}</span>{item.id==='tickets'&&tickets.filter(t=>!['Решена','Отклонена'].includes(t.status)).length>0&&<em>{tickets.filter(t=>!['Решена','Отклонена'].includes(t.status)).length}</em>}</button>)}
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{role === 'admin' ? 'А' : 'С'}</div><div><b>{role === 'admin' ? 'Администратор' : 'Сотрудник'}</b><small>{role === 'admin' ? 'Полный доступ' : 'Работа с заявками'}</small></div><button title="Выйти" onClick={()=>{localStorage.removeItem('token');localStorage.removeItem('role');setLogin(false)}}><LogOut size={16}/></button></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="crumb">ДГУ Инвентарь</span><ChevronRight size={14}/><b>{nav.find(n=>n.id===page)?.label || 'Карточка оборудования'}</b></div><div className="top-actions"><span className="status-dot"></span><span>Система работает</span><div className="avatar">{role === 'admin' ? 'А' : 'С'}</div></div></header>
      {notice && <div className="notice-banner" onClick={()=>setNotice('')}>{notice}<X size={15}/></div>}
      {page==='dashboard'&&<Dashboard stats={stats} equipment={equipment} tickets={tickets} setPage={setPage} setSelected={setSelected}/>}
      {page==='equipment'&&<EquipmentPage equipment={filtered} allEquipment={equipment} search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} roomFilter={roomFilter} setRoomFilter={setRoomFilter} setShowAdd={setShowAdd} setSelected={setSelected}/>}
      {page==='tickets'&&<TicketsPage tickets={tickets} equipment={equipment} users={users} role={role} reload={load} setNotice={setNotice} ticketForm={ticketForm} setTicketForm={setTicketForm} createTicket={createTicket} updateTicket={updateTicket}/>}
      {page==='rooms'&&<RoomsPage rooms={rooms} reload={load} setNotice={setNotice}/>}
      {page==='inventory'&&<InventoryPage equipment={equipment} checkInventory={checkInventory} cancelInventoryCheck={cancelInventoryCheck} checkedInventory={checkedInventory}/>} 
      {page==='assistant'&&<AssistantPage aiText={aiText} setAiText={setAiText} diagnose={diagnose} aiResult={aiResult}/>}
      {page==='users'&&role==='admin'&&<UsersPage users={users} reload={load} setNotice={setNotice}/>}
      {selected&&<EquipmentDetail item={selected} close={()=>setSelected(null)} onEdit={()=>{setEditForm({name:selected.name,inventory_number:selected.inventory_number,type:selected.type,characteristics:selected.characteristics||'',status:selected.status,room:selected.room,building:selected.building||'Главный корпус',floor:String(selected.floor||'1')});setEditing(selected)}} onTicket={()=>{setTicketForm({...ticketForm,equipment_id:String(selected.id)});setPage('tickets');setSelected(null)}}/>}
      {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={saveEquipmentEdit}><div className="modal-head"><div><h2>Редактировать оборудование</h2><p>Изменения сохраняются в карточке устройства</p></div><button type="button" className="icon-btn" onClick={()=>setEditing(null)}><X/></button></div><label>Название<input required value={editForm.name||''} onChange={e=>setEditForm({...editForm,name:e.target.value})}/></label><div className="form-grid"><label>Инвентарный номер<input required value={editForm.inventory_number||''} onChange={e=>setEditForm({...editForm,inventory_number:e.target.value})}/></label><label>Тип<select value={editForm.type||'Компьютер'} onChange={e=>setEditForm({...editForm,type:e.target.value})}><option>Компьютер</option><option>Принтер</option><option>Проектор</option><option>Монитор</option><option>Другое</option></select></label></div><label>Характеристики<textarea value={editForm.characteristics||''} onChange={e=>setEditForm({...editForm,characteristics:e.target.value})}/></label><div className="form-grid"><label>Корпус<input value={editForm.building||'Главный корпус'} onChange={e=>setEditForm({...editForm,building:e.target.value})}/></label><label>Этаж<input value={editForm.floor||'1'} onChange={e=>setEditForm({...editForm,floor:e.target.value})}/></label></div><div className="form-grid"><label>Кабинет<input value={editForm.room||''} onChange={e=>setEditForm({...editForm,room:e.target.value})}/></label><label>Состояние<select value={editForm.status||'Исправно'} onChange={e=>setEditForm({...editForm,status:e.target.value})}><option>Исправно</option><option>Неисправно</option><option>На обслуживании</option></select></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>Отмена</button><button className="primary">Сохранить</button></div></form></div>}
      {showAdd&&<div className="modal-backdrop" onClick={()=>setShowAdd(false)}><form className="modal" onClick={e=>e.stopPropagation()} onSubmit={addEquipment}>
        <div className="modal-head"><div><h2>Добавить оборудование</h2><p>Заполните данные нового устройства</p></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div>
        <label>Название<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Например, Компьютер преподавателя"/></label>
        <div className="form-grid"><label>Инвентарный номер<input required value={form.inventory_number} onChange={e=>setForm({...form,inventory_number:e.target.value})} placeholder="ПК-006"/></label><label>Тип<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>Компьютер</option><option>Принтер</option><option>Проектор</option><option>Монитор</option><option>Другое</option></select></label></div>
        <label>Характеристики<textarea value={form.characteristics} onChange={e=>setForm({...form,characteristics:e.target.value})} placeholder="Основные характеристики"/></label>
        <div className="form-grid"><label>Корпус<input required value={form.building} onChange={e=>setForm({...form,building:e.target.value})} placeholder="Главный корпус"/></label><label>Этаж<input required value={form.floor} onChange={e=>setForm({...form,floor:e.target.value})} placeholder="1"/></label></div><div className="form-grid"><label>Кабинет<input required value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/></label><label>Состояние<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Исправно</option><option>Неисправно</option><option>На обслуживании</option></select></label></div>
        <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setShowAdd(false)}>Отмена</button><button className="primary"><Plus size={16}/> Добавить устройство</button></div>
      </form></div>}
    </main>
  </div>
}

function UsersPage({users,reload,setNotice}) {
  const [form,setForm] = useState({login:'',password:'',role:'employee'})
  const [busy,setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setBusy(true)
    const res = await apiFetch(`${API}/users`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    const data = await res.json().catch(()=>({}))
    setBusy(false)
    if (!res.ok) { setNotice(data.detail || 'Не удалось создать пользователя'); return }
    setForm({login:'',password:'',role:'employee'}); await reload(); setNotice('Пользователь создан')
  }
  async function removeUser(user) {
    if (!window.confirm(`Удалить пользователя «${user.login}»? Он больше не сможет войти в систему.`)) return
    const res = await apiFetch(`${API}/users/${user.id}`, {method:'DELETE'})
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setNotice(data.detail || 'Не удалось удалить пользователя'); return }
    await reload(); setNotice(`Пользователь «${user.login}» удалён`)
  }
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">УПРАВЛЕНИЕ ДОСТУПОМ</div><h1>Пользователи</h1><p>Создавайте учётные записи и назначайте роли сотрудникам.</p></div></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Новая учётная запись</h2><p>Пароль будет сохранён в виде хеша.</p></div></div><form className="stack-form" onSubmit={submit}><label>Логин<input required minLength="3" maxLength="40" value={form.login} onChange={e=>setForm({...form,login:e.target.value})} placeholder="Например, technician1"/></label><label>Временный пароль<input required minLength="8" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Не менее 8 символов"/></label><label>Роль<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="employee">Сотрудник</option><option value="admin">Администратор</option></select></label><button className="primary full" disabled={busy}><Plus size={16}/> Создать пользователя</button></form></section><section className="panel"><div className="panel-head"><div><h2>Учётные записи</h2><p>{users.length} пользователей</p></div></div>{users.map(u=><div className="ticket-row" key={u.id}><div className="ticket-icon"><Settings size={17}/></div><div className="ticket-info"><b>{u.login}</b><small>{u.role === 'admin' ? 'Администратор — полный доступ' : 'Сотрудник — работа с заявками и просмотр'}</small></div><span className={`status-pill ${u.role==='admin'?'blue':'green'}`}>{u.role==='admin'?'Администратор':'Сотрудник'}</span><button className="danger-btn" type="button" onClick={()=>removeUser(u)}>Удалить</button></div>)}</section></div></div>
}

function Dashboard({stats,equipment,tickets,setPage,setSelected}) {
  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow">ОБЗОР СИСТЕМЫ</div><h1>Добро пожаловать 👋</h1><p>Вот что происходит с оборудованием колледжа сегодня.</p></div><button className="primary" onClick={()=>setPage('equipment')}><Monitor size={16}/> Открыть реестр</button></div>
    <div className="stats-grid">
      <Stat title="Всего оборудования" value={stats.equipment_total??0} icon={Package} tone="blue" foot="Зарегистрировано в системе"/>
      <Stat title="Исправно" value={stats.equipment_ok??0} icon={CheckCircle2} tone="green" foot="Готово к использованию"/>
      <Stat title="Неисправно" value={stats.equipment_broken??0} icon={AlertTriangle} tone="red" foot="Требует внимания"/>
      <Stat title="Открытые заявки" value={stats.tickets_open??0} icon={ClipboardList} tone="amber" foot="Ожидают решения"/>
    </div>
    <div className="dashboard-grid">
      <section className="panel"><div className="panel-head"><div><h2>Последнее оборудование</h2><p>Недавно добавленные устройства</p></div><button className="text-btn" onClick={()=>setPage('equipment')}>Весь реестр <ArrowUpRight size={15}/></button></div><EquipmentTable equipment={equipment.slice(-5).reverse()} onSelect={setSelected}/></section>
      <section className="panel"><div className="panel-head"><div><h2>Последние заявки</h2><p>Обращения технической поддержки</p></div><button className="text-btn" onClick={()=>setPage('tickets')}>Все заявки <ArrowUpRight size={15}/></button></div>{tickets.slice(0,5).map(t=><div className="ticket-mini" key={t.id}><div className="ticket-icon"><Wrench size={17}/></div><div className="ticket-info"><b>#{String(t.id).padStart(4,'0')} · {t.equipment_name}</b><small>{t.description}</small></div><Status status={t.status}/></div>)}{tickets.length===0&&<Empty text="Пока заявок нет"/>}</section>
    </div>
    <div className="tip-card"><div className="tip-icon"><QrCode/></div><div><b>Быстрая инвентаризация</b><p>Сканируйте QR-код на устройстве, чтобы открыть его карточку и проверить наличие.</p></div><button className="secondary" onClick={()=>setPage('inventory')}>Перейти <ChevronRight size={16}/></button></div>
  </div>
}
function Stat({title,value,icon:Icon,tone,foot}) {return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>}
function EquipmentPage({equipment,allEquipment,search,setSearch,typeFilter,setTypeFilter,roomFilter,setRoomFilter,setShowAdd,setSelected}) {
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">УПРАВЛЕНИЕ РЕСУРСАМИ</div><h1>Оборудование</h1><p>Единый реестр техники колледжа.</p></div><button className="primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> Добавить оборудование</button></div>
    <div className="panel"><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Поиск по названию или инв. номеру..." value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="filter-controls"><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="">Все типы</option>{[...new Set(allEquipment.map(x=>x.type))].map(x=><option key={x}>{x}</option>)}</select><select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}><option value="">Все кабинеты</option>{[...new Set(allEquipment.map(x=>x.room))].map(x=><option key={x}>{x}</option>)}</select><span className="muted">{equipment.length} устройств</span></div></div><EquipmentTable equipment={equipment} onSelect={setSelected}/></div></div>
}
function EquipmentTable({equipment,onSelect}) {
  return <div className="table-wrap"><table><thead><tr><th>ОБОРУДОВАНИЕ</th><th>ИНВЕНТАРНЫЙ №</th><th>ТИП</th><th>КАБИНЕТ</th><th>СОСТОЯНИЕ</th><th></th></tr></thead><tbody>{equipment.map(e=><tr key={e.id} onClick={()=>onSelect(e)}><td><div className="equip-cell"><div className="equip-icon"><Monitor size={17}/></div><div><b>{e.name}</b><small>{e.characteristics||'Характеристики не указаны'}</small></div></div></td><td><code>{e.inventory_number}</code></td><td>{e.type}</td><td><span className="location"><MapPin size={14}/> {e.room}</span></td><td><Status status={e.status}/></td><td><ChevronRight size={16} className="row-chevron"/></td></tr>)}</tbody></table>{equipment.length===0&&<Empty text="Оборудование не найдено"/>}</div>
}
function Status({status}) {
  const cls=status==='Исправно'||status==='Решена'?'green':status==='Неисправно'||status==='Отклонена'?'red':status==='В работе'||status==='На обслуживании'?'amber':'blue'
  return <span className={`status-pill ${cls}`}><i/>{status}</span>
}
function TicketsPage({tickets,equipment,users,role,reload,setNotice,ticketForm,setTicketForm,createTicket,updateTicket}) {
  const [comments,setComments] = useState({})
  const [assignees,setAssignees] = useState({})
  const [query,setQuery] = useState('')
  const [statusFilter,setStatusFilter] = useState('')
  const [categoryFilter,setCategoryFilter] = useState('')
  const [buildingFilter,setBuildingFilter] = useState('')
  const [roomFilter,setRoomFilter] = useState('')
  const [dateFrom,setDateFrom] = useState('')
  const [dateTo,setDateTo] = useState('')
  const [pageNumber,setPageNumber] = useState(1)
  const [selectedIds,setSelectedIds] = useState([])
  const [historyTicket,setHistoryTicket] = useState(null)
  const [ticketHistory,setTicketHistory] = useState([])
  const [historyLoading,setHistoryLoading] = useState(false)
  const pageSize = 8
  const buildings = [...new Set(tickets.map(t=>t.building).filter(Boolean))].sort()
  const rooms = [...new Set(tickets.filter(t=>!buildingFilter || t.building===buildingFilter).map(t=>t.room).filter(Boolean))].sort()
  const filtered = tickets.filter(t => {
    const haystack = [t.id,t.equipment_name,t.inventory_number,t.description,t.comment,t.assigned_to,t.room,t.building].join(' ').toLowerCase()
    const date = t.created_at ? new Date(t.created_at) : null
    const fromOk = !dateFrom || (date && date >= new Date(`${dateFrom}T00:00:00`))
    const toOk = !dateTo || (date && date <= new Date(`${dateTo}T23:59:59`))
    return (!query || haystack.includes(query.toLowerCase())) &&
      (!statusFilter || t.status===statusFilter) && (!categoryFilter || t.category===categoryFilter) &&
      (!buildingFilter || t.building===buildingFilter) && (!roomFilter || t.room===roomFilter) && fromOk && toOk
  })
  const pages = Math.max(1,Math.ceil(filtered.length/pageSize))
  const visible = filtered.slice((pageNumber-1)*pageSize,pageNumber*pageSize)
  function resetFilters(){setQuery('');setStatusFilter('');setCategoryFilter('');setBuildingFilter('');setRoomFilter('');setDateFrom('');setDateTo('');setPageNumber(1)}
  async function showHistory(id) {
    if (historyTicket === id) { setHistoryTicket(null); return }
    setHistoryTicket(id); setHistoryLoading(true); setTicketHistory([])
    try { const r = await apiFetch(`${API}/tickets/${id}/history`); if (r.ok) setTicketHistory(await r.json()) } catch {}
    setHistoryLoading(false)
  }
  async function deleteOne(id) {
    if (!window.confirm(`Удалить заявку №${id} вместе со всей историей? Это действие нельзя отменить.`)) return
    const res = await apiFetch(`${API}/tickets/${id}`, {method:'DELETE'})
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setNotice(data.detail || 'Не удалось удалить заявку'); return }
    setSelectedIds(ids=>ids.filter(x=>x!==id)); await reload(); setNotice('Заявка удалена')
  }
  async function deleteSelected() {
    const ids = selectedIds.filter(id=>tickets.some(t=>t.id===id))
    if (!ids.length) return
    if (!window.confirm(`Удалить выбранные заявки (${ids.length}) вместе со всей историей? Это действие нельзя отменить.`)) return
    const res = await apiFetch(`${API}/tickets/bulk-delete`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})})
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setNotice(data.detail || 'Не удалось удалить заявки'); return }
    setSelectedIds([]); await reload(); setNotice(`Удалено заявок: ${data.deleted}`)
  }
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">ТЕХНИЧЕСКАЯ ПОДДЕРЖКА</div><h1>Заявки на ремонт</h1><p>Создавайте обращения, назначайте исполнителей и отслеживайте выполнение.</p></div></div>
    <div className="dashboard-grid tickets-layout"><section className="panel"><div className="panel-head"><div><h2>Создать заявку</h2><p>Сообщить о неисправности</p></div><div className="panel-icon"><ClipboardList/></div></div><form className="stack-form" onSubmit={createTicket}><label>Оборудование<select required value={ticketForm.equipment_id} onChange={e=>setTicketForm({...ticketForm,equipment_id:e.target.value})}><option value="">Выберите устройство</option>{equipment.map(e=><option value={e.id} key={e.id}>{e.inventory_number} — {e.name}</option>)}</select></label><label>Категория<select value={ticketForm.category} onChange={e=>setTicketForm({...ticketForm,category:e.target.value})}><option>Не определена</option><option>Компьютер</option><option>Принтер</option><option>Проектор</option><option>Сеть</option><option>Другое</option></select></label><label>Описание проблемы<textarea required value={ticketForm.description} onChange={e=>setTicketForm({...ticketForm,description:e.target.value})} placeholder="Опишите, что произошло..."/></label><button className="primary full"><Plus size={16}/> Создать заявку</button></form></section>
    <section className="panel tickets-list-panel"><div className="panel-head"><div><h2>Все обращения</h2><p>Найдено: {filtered.length} из {tickets.length} заявок</p></div><span className="muted">Страница {pageNumber} из {pages}</span></div>
      <div className="ticket-filters">
        <div className="search-box ticket-search"><Search size={16}/><input placeholder="Поиск: номер, устройство, описание, исполнитель..." value={query} onChange={e=>{setQuery(e.target.value);setPageNumber(1)}}/></div>
        <div className="ticket-filter-grid">
          <label>Статус<select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPageNumber(1)}}><option value="">Все статусы</option>{['Новая','На рассмотрении','В работе','Нужны уточнения','Решена','Отклонена'].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Категория<select value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setPageNumber(1)}}><option value="">Все категории</option>{[...new Set(tickets.map(t=>t.category).filter(Boolean))].map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Корпус<select value={buildingFilter} onChange={e=>{setBuildingFilter(e.target.value);setRoomFilter('');setPageNumber(1)}}><option value="">Все корпуса</option>{buildings.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Кабинет<select value={roomFilter} onChange={e=>{setRoomFilter(e.target.value);setPageNumber(1)}}><option value="">Все кабинеты</option>{rooms.map(x=><option key={x}>{x}</option>)}</select></label>
          <label>Дата с<input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPageNumber(1)}}/></label>
          <label>Дата по<input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPageNumber(1)}}/></label>
        </div>
        <button className="text-btn clear-ticket-filters" onClick={resetFilters}>Сбросить фильтры</button>
      </div>
      {role==='admin'&&<div className="ticket-bulk-actions"><label><input type="checkbox" checked={visible.length>0&&visible.every(t=>selectedIds.includes(t.id))} onChange={e=>setSelectedIds(ids=>e.target.checked?[...new Set([...ids,...visible.map(t=>t.id)])]:ids.filter(id=>!visible.some(t=>t.id===id)))}/> Выбрать заявки на этой странице</label><button className="secondary" disabled={!selectedIds.length} onClick={deleteSelected}>Удалить выбранные ({selectedIds.length})</button></div>}
      {visible.map(t=><div className="ticket-row" key={t.id}><div className="ticket-icon"><Wrench size={17}/></div><div className="ticket-info"><b>#{String(t.id).padStart(4,'0')} · {t.equipment_name}</b><small>{t.inventory_number} · {t.building || 'Корпус не указан'} · каб. {t.room || '—'} · {t.created_at ? new Date(t.created_at).toLocaleString('ru-RU') : 'Дата не указана'}</small><small>{t.description}</small><small>Исполнитель: {t.assigned_to || 'Не назначен'}</small><button type="button" className="text-btn" onClick={()=>showHistory(t.id)}>{historyTicket===t.id?'Скрыть историю':'История изменений'}</button>{historyTicket===t.id&&<div className="equipment-history ticket-history">{historyLoading?<small>Загрузка истории…</small>:ticketHistory.length===0?<small>История пока пуста.</small>:ticketHistory.map((h,i)=><small key={i}>{h.status} · {h.actor} · {h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : 'Дата не указана'}</small>)}</div>}<div className="ticket-controls"><select value={t.status} onChange={e=>updateTicket(t.id,e.target.value,comments[t.id]??t.comment??'',assignees[t.id]??t.assigned_to??'')}><option>Новая</option><option>На рассмотрении</option><option>В работе</option><option>Нужны уточнения</option><option>Решена</option><option>Отклонена</option></select><select aria-label="Исполнитель" value={assignees[t.id]??t.assigned_to??''} onChange={e=>setAssignees({...assignees,[t.id]:e.target.value})}><option value="">Не назначен</option>{users.map(u=><option key={u.id} value={u.login}>{u.login}</option>)}</select><input aria-label="Комментарий к заявке" placeholder="Комментарий сотрудника" value={comments[t.id]??t.comment??''} onChange={e=>setComments({...comments,[t.id]:e.target.value})}/><button className="secondary" onClick={()=>updateTicket(t.id,t.status,comments[t.id]??t.comment??'',assignees[t.id]??t.assigned_to??'')}>Сохранить изменения</button>{role==='admin'&&<button className="danger-btn" onClick={()=>deleteOne(t.id)}>Удалить</button>}</div></div><Status status={t.status}/></div>)}
      {visible.length===0&&<Empty text="По выбранным условиям заявки не найдены"/>}
      {filtered.length>pageSize&&<div className="ticket-pagination"><button className="secondary" disabled={pageNumber===1} onClick={()=>setPageNumber(p=>Math.max(1,p-1))}>Назад</button><span>{pageNumber} / {pages}</span><button className="secondary" disabled={pageNumber===pages} onClick={()=>setPageNumber(p=>Math.min(pages,p+1))}>Далее</button></div>}
    </section></div></div>
}

function RoomsPage({rooms,reload,setNotice}) {
  const [form,setForm] = useState({building:'Главный корпус',floor:'1',room:''})
  async function addRoom(e) {
    e.preventDefault()
    const res = await apiFetch(`${API}/rooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setNotice(data.detail || 'Не удалось добавить кабинет'); return }
    setForm({...form,room:''}); await reload(); setNotice('Кабинет добавлен')
  }
  async function removeRoom(id) {
    const res = await apiFetch(`${API}/rooms/${id}`,{method:'DELETE'})
    const data = await res.json().catch(()=>({}))
    if (!res.ok) { setNotice(data.detail || 'Не удалось удалить кабинет'); return }
    await reload(); setNotice('Кабинет удалён')
  }
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">СПРАВОЧНИК ПОМЕЩЕНИЙ</div><h1>Кабинеты</h1><p>Добавляйте кабинеты и следите, где размещено оборудование.</p></div></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Добавить кабинет</h2><p>Укажите корпус, этаж и номер</p></div></div><form className="stack-form" onSubmit={addRoom}><label>Корпус<input required value={form.building} onChange={e=>setForm({...form,building:e.target.value})}/></label><label>Этаж<input value={form.floor} onChange={e=>setForm({...form,floor:e.target.value})}/></label><label>Номер кабинета<input required value={form.room} onChange={e=>setForm({...form,room:e.target.value})}/></label><button className="primary full"><Plus size={16}/> Добавить кабинет</button></form></section>
    <section className="panel"><div className="panel-head"><div><h2>Список кабинетов</h2><p>{rooms.length} помещений</p></div></div>{rooms.map(r=><div className="ticket-row" key={r.id}><div className="ticket-icon"><MapPin size={17}/></div><div className="ticket-info"><b>{r.room} — {r.building}</b><small>Этаж: {r.floor} · Оборудования: {r.equipment_count}</small></div><button className="secondary" onClick={()=>removeRoom(r.id)}>Удалить</button></div>)}{rooms.length===0&&<Empty text="Кабинетов пока нет"/>}</section></div></div>
}

function InventoryPage({equipment,checkInventory,cancelInventoryCheck,checkedInventory}) {
  const checkedRecords = checkedInventory
  const checked = checkedRecords.map(c => typeof c === 'number' ? c : c.equipment_id)
  const latestCheck = id => checkedRecords.find(c => typeof c !== 'number' && c.equipment_id === id)

  const toggle = async (id) => {
    if (checked.includes(id)) {
      if (!window.confirm('Снять отметку «Проверено»? Оборудование снова станет непроверенным.')) return
      await cancelInventoryCheck(id)
      return
    }
    await checkInventory(id)
  }
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">ПРОВЕРКА НАЛИЧИЯ</div><h1>Инвентаризация</h1><p>Отмечайте оборудование после проверки наличия. Ошибочную отметку можно снять.</p></div><div className="inventory-progress"><b>{checked.length} / {equipment.length}</b><small>проверено</small></div></div><div className="panel"><div className="panel-head"><div><h2>Список устройств</h2><p>Проверка наличия оборудования в кабинетах</p></div><span className="status-pill blue"><QrCode size={13}/> QR-инвентаризация</span></div><div className="inventory-list">{equipment.map(e=><div className="inventory-item" key={e.id}><div className="equip-icon"><Monitor size={17}/></div><div className="ticket-info"><b>{e.name}</b><small>{e.inventory_number} · Кабинет {e.room}</small><span className={`inventory-state ${checked.includes(e.id) ? 'is-checked' : 'is-pending'}`}>{checked.includes(e.id) ? 'Проверено' : 'Не проверено'}</span>{checked.includes(e.id) && latestCheck(e.id)?.checked_at && <small>Последняя проверка: {new Date(latestCheck(e.id).checked_at).toLocaleString('ru-RU')} · {latestCheck(e.id).checked_by || 'пользователь'}</small>}</div><img className="qr-small" src={`${API}/equipment/${e.id}/qr`} alt="QR"/><button
  className={checked.includes(e.id) ? 'secondary' : 'success-btn'}
  onClick={() => toggle(e.id)}
>{checked.includes(e.id) ? 'Снять отметку' : <><CheckCircle2 size={15}/> Отметить проверенным</>}</button></div>)}</div></div></div>
}
function AssistantPage({aiText,setAiText,diagnose,aiResult}) {
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">УМНЫЙ ПОМОЩНИК</div><h1>ИИ-помощник</h1><p>Первичная оценка неисправностей и безопасные рекомендации.</p></div></div><div className="assistant-layout"><section className="panel assistant-panel"><div className="assistant-hero"><div className="bot-large"><Bot size={28}/></div><h2>Чем могу помочь?</h2><p>Опишите проблему с оборудованием. Помощник предложит безопасные действия или подскажет, когда следует обратиться к специалисту.</p></div><form onSubmit={diagnose} className="stack-form"><label>Описание неисправности<textarea value={aiText} onChange={e=>setAiText(e.target.value)} required placeholder="Например: компьютер не включается..."/></label><button className="primary full"><Bot size={16}/> Проанализировать</button></form>{aiResult&&<div className={`ai-result ${aiResult.danger?'danger':''}`}><div className="result-heading">{aiResult.danger?<AlertTriangle/>:<CheckCircle2/>}<b>{aiResult.category}</b></div><p>{aiResult.recommendation}</p><small>Демонстрационный помощник. Рекомендации не заменяют специалиста.</small></div>}</section><aside className="panel examples"><h3>Примеры запросов</h3>{['Компьютер не включается, индикаторы не горят','Принтер не печатает, показывает ошибку бумаги','Из розетки идёт дым','Проектор включается, но нет изображения','Не работает интернет в кабинете','Оборудование работает неправильно','Не работает'].map(x=><button key={x} onClick={()=>setAiText(x)}>{x}<ChevronRight size={15}/></button>)}<div className="safety-note"><AlertTriangle size={17}/><span>При дыме, искрении или запахе гари не трогайте оборудование. Сообщите ответственному сотруднику.</span></div></aside></div></div>
}
function EquipmentDetail({item,close,onTicket,onEdit}) {
  const [history,setHistory] = useState([])
  const [status,setStatus] = useState(item.status)
  useEffect(()=>{ apiFetch(`${API}/equipment/${item.id}/history`).then(r=>r.ok?r.json():[]).then(setHistory).catch(()=>setHistory([])) },[item.id])
  async function saveStatus(){ const r=await apiFetch(`${API}/equipment/${item.id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})}); if(r.ok) item.status=status }
  return <div className="modal-backdrop" onClick={close}><div className="modal detail-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">КАРТОЧКА УСТРОЙСТВА</div><h2>{item.name}</h2><p>{item.inventory_number}</p></div><button className="icon-btn" onClick={close}><X/></button></div><div className="detail-body"><div className="detail-qr"><img src={`${API}/equipment/${item.id}/qr`} alt="QR-код оборудования"/><small>QR-код устройства</small><a className="secondary" href={`${API}/equipment/${item.id}/qr`} download={`equipment-${item.id}-qr.png`}>Скачать QR</a><button className="secondary" onClick={()=>window.print()}>Печать карточки</button></div><div className="detail-fields"><div><small>Тип</small><b>{item.type}</b></div><div><small>Корпус</small><b>{item.building || 'Не указано'}</b></div><div><small>Этаж</small><b>{item.floor || 'Не указан'}</b></div><div><small>Кабинет</small><b>{item.room}</b></div><div><small>Состояние</small><Status status={item.status}/></div><div><small>Характеристики</small><b>{item.characteristics||'Не указаны'}</b></div><div><small>Изменить состояние</small><select value={status} onChange={e=>setStatus(e.target.value)}><option>Исправно</option><option>Неисправно</option><option>На обслуживании</option></select><button className="secondary" onClick={saveStatus}>Сохранить состояние</button></div></div></div><section className="equipment-history"><h3>История обслуживания</h3>{history.length===0?<p>История пока пуста.</p>:history.map(t=><div key={t.ticket_id}><b>Заявка #{t.ticket_id}: {t.description}</b><small>Текущий статус: {t.status}</small>{t.history.map((h,i)=><small key={i}>{h.status} · {h.actor} · {h.created_at}</small>)}</div>)}</section><div className="modal-actions"><button className="secondary" onClick={close}>Закрыть</button><button className="secondary" onClick={onEdit}>Редактировать</button><button className="primary" onClick={onTicket}><Wrench size={16}/> Создать заявку</button></div></div></div>
}
function Empty({text}) {return <div className="empty"><Package size={26}/><span>{text}</span></div>}

createRoot(document.getElementById('root')).render(<Root/>)
