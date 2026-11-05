from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from io import BytesIO
import qrcode

from .database import Base, engine, get_db, SessionLocal
from . import models, schemas
from .security import hash_password, verify_password, create_token, SECRET_KEY, ALGORITHM

app = FastAPI(title="ДГУ Инвентарь API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
Base.metadata.create_all(bind=engine)
# Мягкая миграция для существующей SQLite-базы проекта.
with engine.begin() as connection:
    ticket_columns = [row[1] for row in connection.execute(text("PRAGMA table_info(tickets)"))]
    if "assigned_to" not in ticket_columns:
        connection.execute(text("ALTER TABLE tickets ADD COLUMN assigned_to VARCHAR"))

def seed_data():
    db = SessionLocal()
    try:
        if not db.query(models.User).filter_by(login="admin").first():
            db.add(models.User(login="admin", password_hash=hash_password("admin123"), role="admin"))
        if db.query(models.Equipment).count() == 0:
            rooms = {}
            for room_num in ["214", "305", "108"]:
                loc = models.Location(building="Главный корпус", floor="2", room=room_num)
                db.add(loc)
                db.flush()
                rooms[room_num] = loc.id
            sample = [
                ("Компьютер преподавателя", "ПК-001", "Компьютер", "Intel Core i5, 16 ГБ RAM", "Исправно", "214"),
                ("Принтер HP", "PR-002", "Принтер", "Лазерный принтер", "Исправно", "214"),
                ("Проектор Epson", "PJ-003", "Проектор", "HDMI, 1920x1080", "На обслуживании", "305"),
                ("Монитор Dell", "MN-004", "Монитор", "24 дюйма", "Исправно", "108"),
                ("Компьютер студентский", "ПК-005", "Компьютер", "Intel Core i3, 8 ГБ RAM", "Неисправно", "108"),
            ]
            for name, inv, typ, chars, status, room in sample:
                db.add(models.Equipment(name=name, inventory_number=inv, type=typ,
                                      characteristics=chars, status=status,
                                      location_id=rooms[room]))
        db.commit()
    finally:
        db.close()

seed_data()

security = HTTPBearer(auto_error=False)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        login = payload.get("sub")
        if not login:
            raise HTTPException(status_code=401, detail="Недействительный токен")
    except JWTError:
        raise HTTPException(status_code=401, detail="Недействительный или просроченный токен")
    user = db.query(models.User).filter_by(login=login).first()
    if not user:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user

def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Недостаточно прав. Требуется роль администратора")
    return current_user

@app.get("/")
def root():
    return {"message": "ДГУ Инвентарь API", "docs": "/docs"}

@app.post("/api/login")
def login(data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter_by(login=data.login).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"access_token": create_token(user.login), "token_type": "bearer", "role": user.role}

def equipment_dict(item, db):
    location = db.query(models.Location).filter_by(id=item.location_id).first() if item.location_id else None
    return {
        "id": item.id, "name": item.name, "inventory_number": item.inventory_number,
        "type": item.type, "characteristics": item.characteristics, "status": item.status,
        "location_id": item.location_id, "room": location.room if location else "Не указано",
        "building": location.building if location else "Не указано",
        "floor": location.floor if location else "Не указано",
        "location": f"{location.building}, этаж {location.floor}, кабинет {location.room}" if location else "Не указано"
    }

@app.get("/api/equipment")
def list_equipment(search: str = "", status: str = "", type: str = "", room: str = "", db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.Equipment)
    if search:
        query = query.filter(or_(models.Equipment.name.ilike(f"%{search}%"),
                                models.Equipment.inventory_number.ilike(f"%{search}%")))
    if status:
        query = query.filter(models.Equipment.status == status)
    if type:
        query = query.filter(models.Equipment.type == type)
    if room:
        query = query.join(models.Location).filter(models.Location.room == room)
    return [equipment_dict(item, db) for item in query.order_by(models.Equipment.id.desc()).all()]

@app.post("/api/equipment")
def create_equipment(data: schemas.EquipmentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    if db.query(models.Equipment).filter_by(inventory_number=data.inventory_number).first():
        raise HTTPException(status_code=409, detail="Такой инвентарный номер уже существует")
    location = db.query(models.Location).filter_by(building=data.building, floor=data.floor, room=data.room).first()
    if not location:
        location = models.Location(building=data.building, floor=data.floor, room=data.room)
        db.add(location)
        db.flush()
    item = models.Equipment(name=data.name, inventory_number=data.inventory_number,
                           type=data.type, characteristics=data.characteristics,
                           status=data.status, location_id=location.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return equipment_dict(item, db)

@app.get("/api/equipment/{equipment_id}")
def get_equipment(equipment_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    return equipment_dict(item, db)

@app.get("/api/equipment/{equipment_id}/qr")
def equipment_qr(equipment_id: int, request: Request, db: Session = Depends(get_db)):
    item = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    origin = request.headers.get("origin") or (f"{forwarded_proto}://{forwarded_host}" if forwarded_host else str(request.base_url).rstrip("/"))
    qr = qrcode.make(f"http://localhost:5173/?equipment={item.id}")
    buffer = BytesIO()
    qr.save(buffer, format="PNG")
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="image/png")

@app.get("/api/tickets")
def list_tickets(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    tickets = db.query(models.Ticket).order_by(models.Ticket.id.desc()).all()
    result = []
    for ticket in tickets:
        equipment = db.query(models.Equipment).filter_by(id=ticket.equipment_id).first()
        result.append({
            "id": ticket.id, "equipment_id": ticket.equipment_id,
            "equipment_name": equipment.name if equipment else "Удалённое оборудование",
            "inventory_number": equipment.inventory_number if equipment else "",
            "room": (db.query(models.Location).filter_by(id=equipment.location_id).first().room if equipment and equipment.location_id and db.query(models.Location).filter_by(id=equipment.location_id).first() else ""),
            "building": (db.query(models.Location).filter_by(id=equipment.location_id).first().building if equipment and equipment.location_id and db.query(models.Location).filter_by(id=equipment.location_id).first() else ""),
            "floor": (db.query(models.Location).filter_by(id=equipment.location_id).first().floor if equipment and equipment.location_id and db.query(models.Location).filter_by(id=equipment.location_id).first() else ""),
            "description": ticket.description, "category": ticket.category,
            "status": ticket.status, "comment": ticket.comment,
            "assigned_to": ticket.assigned_to,
            "created_at": str(ticket.created_at) if ticket.created_at else ""
        })
    return result

@app.post("/api/tickets")
def create_ticket(data: schemas.TicketCreate, db: Session = Depends(get_db)):
    equipment = db.query(models.Equipment).filter_by(
        id=data.equipment_id
    ).first()

    if not equipment:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")

    ticket = models.Ticket(
        equipment_id=data.equipment_id,
        description=data.description,
        category=data.category,
        status="Новая"
    )

    db.add(ticket)
    db.flush()

    db.add(models.TicketHistory(
        ticket_id=ticket.id,
        status="Новая",
        actor="user"
    ))

    # Состояние оборудования отдельно подтверждает ответственный сотрудник.

    db.commit()
    db.refresh(ticket)

    return {"id": ticket.id, "status": ticket.status}

@app.patch("/api/tickets/{ticket_id}")
def update_ticket(
    ticket_id: int,
    data: schemas.TicketUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    allowed = [
        "Новая",
        "На рассмотрении",
        "В работе",
        "Нужны уточнения",
        "Решена",
        "Отклонена"
    ]

    if data.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail="Недопустимый статус"
        )

    ticket = db.query(models.Ticket).filter_by(
        id=ticket_id
    ).first()

    if not ticket:
        raise HTTPException(
            status_code=404,
            detail="Заявка не найдена"
        )

    # Обновляем статус заявки
    ticket.status = data.status
    ticket.comment = data.comment
    if data.assigned_to is not None:
        assignee = data.assigned_to.strip()
        if assignee and not db.query(models.User).filter_by(login=assignee).first():
            raise HTTPException(status_code=400, detail="Выбранный исполнитель не найден")
        ticket.assigned_to = assignee or None

    db.commit()
    db.refresh(ticket)

    # Записываем изменение в историю
    db.add(models.TicketHistory(
        ticket_id=ticket.id,
        status=data.status,
        actor=current_user.login
    ))

    db.commit()

    return {"message": "Статус заявки обновлён"}

@app.delete("/api/tickets/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    ticket = db.query(models.Ticket).filter_by(id=ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    # Удаляем историю явно, так как в SQLite каскадное удаление не включено.
    db.query(models.TicketHistory).filter_by(ticket_id=ticket_id).delete(synchronize_session=False)
    db.delete(ticket)
    db.commit()
    return {"message": "Заявка и её история удалены", "deleted": 1}

@app.post("/api/tickets/bulk-delete")
def bulk_delete_tickets(data: schemas.TicketBulkDelete, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    ids = sorted(set(data.ids))
    if not ids:
        raise HTTPException(status_code=400, detail="Не выбраны заявки для удаления")
    found = db.query(models.Ticket.id).filter(models.Ticket.id.in_(ids)).all()
    found_ids = [row[0] for row in found]
    if not found_ids:
        raise HTTPException(status_code=404, detail="Выбранные заявки не найдены")
    db.query(models.TicketHistory).filter(models.TicketHistory.ticket_id.in_(found_ids)).delete(synchronize_session=False)
    db.query(models.Ticket).filter(models.Ticket.id.in_(found_ids)).delete(synchronize_session=False)
    db.commit()
    return {"message": "Выбранные заявки и их история удалены", "deleted": len(found_ids), "missing": len(ids)-len(found_ids)}

@app.get("/api/stats")
def stats(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    equipment = db.query(models.Equipment).all()
    tickets = db.query(models.Ticket).all()
    return {
        "equipment_total": len(equipment),
        "equipment_ok": sum(1 for e in equipment if e.status == "Исправно"),
        "equipment_broken": sum(1 for e in equipment if e.status == "Неисправно"),
        "equipment_service": sum(1 for e in equipment if e.status == "На обслуживании"),
        "tickets_open": sum(1 for t in tickets if t.status not in ["Решена", "Отклонена"]),
        "tickets_resolved": sum(1 for t in tickets if t.status == "Решена"),
    }

@app.get("/api/inventory/checks")
def inventory_checks(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    checks = db.query(models.InventoryCheck).order_by(models.InventoryCheck.checked_at.desc()).all()
    latest = {}
    for check in checks:
        latest.setdefault(check.equipment_id, {
            "equipment_id": check.equipment_id,
            "checked_by": check.checked_by,
            "checked_at": str(check.checked_at) if check.checked_at else ""
        })
    return list(latest.values())


@app.post("/api/inventory/{equipment_id}/check")
def inventory_check(equipment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    equipment = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    db.add(models.InventoryCheck(equipment_id=equipment_id, checked_by=current_user.login))
    db.commit()
    return {"message": "Оборудование отмечено как проверенное"}


@app.delete("/api/inventory/{equipment_id}/check")
def cancel_inventory_check(equipment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    equipment = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    # Удаляем только последнюю отметку: предыдущие записи истории сохраняются.
    latest = db.query(models.InventoryCheck).filter_by(equipment_id=equipment_id).order_by(models.InventoryCheck.checked_at.desc(), models.InventoryCheck.id.desc()).first()
    if not latest:
        raise HTTPException(status_code=404, detail="Отметка инвентаризации не найдена")
    db.delete(latest)
    db.commit()
    return {"message": "Последняя отметка инвентаризации отменена"}

@app.get("/api/ai/diagnose")
def ai_diagnose(text: str, current_user: models.User = Depends(get_current_user)):
    """Демонстрационный помощник: безопасная первичная классификация, не ремонтная инструкция."""
    import re
    normalized = re.sub(r"\s+", " ", (text or "").lower()).strip()

    if len(normalized) < 8:
        return {
            "category": "Недостаточно информации",
            "recommendation": "Опишите, какое оборудование неисправно, что именно произошло и когда появилась проблема. Не разбирайте устройство самостоятельно.",
            "danger": False,
            "next_step": "Уточнить тип оборудования и симптомы"
        }

    # Опасные признаки проверяются до обычных неисправностей.
    danger_terms = ("дым", "искр", "запах гари", "пахнет гар", "горит", "пламя", "оплавил")
    if any(term in normalized for term in danger_terms):
        return {
            "category": "Опасная ситуация",
            "recommendation": "Не прикасайтесь к устройству и не пытайтесь его ремонтировать. Отойдите на безопасное расстояние и немедленно сообщите ответственному сотруднику или экстренной службе учреждения. Не используйте оборудование до проверки специалистом.",
            "danger": True,
            "next_step": "Немедленно передать информацию ответственному специалисту"
        }

    if any(term in normalized for term in ("принтер", "мфу")):
        if any(term in normalized for term in ("бумаг", "замял", "замят", "печата", "печать", "картридж")):
            return {
                "category": "Принтер",
                "recommendation": "Уточните, какое сообщение об ошибке показывает принтер и затрагивает ли проблема все задания. Не разбирайте устройство. Если ошибка не исчезает, создайте заявку техническому специалисту.",
                "danger": False,
                "next_step": "Проверить сообщение на дисплее и при необходимости создать заявку"
            }
        return {
            "category": "Принтер — требуется уточнение",
            "recommendation": "Уточните модель принтера, текст сообщения об ошибке и что происходит при отправке задания на печать. Если проблема сохраняется, оформите заявку.",
            "danger": False,
            "next_step": "Уточнить симптомы"
        }

    if any(term in normalized for term in ("проектор", "изображени", "экран")):
        return {
            "category": "Проектор / изображение",
            "recommendation": "Уточните, включается ли проектор и видит ли компьютер подключённый экран. Не вскрывайте корпус и не пытайтесь ремонтировать устройство. При сохранении проблемы создайте заявку.",
            "danger": False,
            "next_step": "Уточнить состояние проектора и подключение"
        }

    if any(term in normalized for term in ("сеть", "интернет", "wi-fi", "wifi")):
        return {
            "category": "Сеть",
            "recommendation": "Уточните, проблема возникает на одном устройстве или у нескольких пользователей, и появляется ли сообщение об отсутствии подключения. Если проблема сохраняется, передайте сведения сетевому специалисту.",
            "danger": False,
            "next_step": "Определить масштаб проблемы и создать заявку"
        }

    if any(term in normalized for term in ("не включ", "не запуска", "компьютер", "ноутбук", "монитор")):
        return {
            "category": "Компьютер",
            "recommendation": "Уточните, включаются ли индикаторы и появляется ли сообщение на экране. Не вскрывайте корпус и не выполняйте ремонт самостоятельно. Если проблема сохраняется, создайте заявку техническому специалисту.",
            "danger": False,
            "next_step": "Уточнить признаки неисправности и передать заявку"
        }

    return {
        "category": "Неизвестная неисправность",
        "recommendation": "По описанию пока нельзя определить категорию проблемы. Укажите тип оборудования, наблюдаемые симптомы и когда они появились. Не выполняйте ремонтные действия самостоятельно; при необходимости создайте заявку специалисту.",
        "danger": False,
        "next_step": "Уточнить описание или обратиться к специалисту"
    }

@app.get("/api/tickets/{ticket_id}/history")
def ticket_history(ticket_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return [
        {"status": h.status, "actor": h.actor, "created_at": str(h.created_at)}
        for h in db.query(models.TicketHistory).filter_by(ticket_id=ticket_id).order_by(models.TicketHistory.id).all()
    ]

# Дополнительные функции реестра и истории обслуживания
@app.patch("/api/equipment/{equipment_id}")
def edit_equipment(equipment_id: int, data: schemas.EquipmentCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    item = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    duplicate = db.query(models.Equipment).filter(models.Equipment.inventory_number == data.inventory_number, models.Equipment.id != equipment_id).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Такой инвентарный номер уже существует")
    location = db.query(models.Location).filter_by(building=data.building, floor=data.floor, room=data.room).first()
    if not location:
        location = models.Location(building=data.building, floor=data.floor, room=data.room)
        db.add(location)
        db.flush()
    for field in ("name", "inventory_number", "type", "characteristics", "status"):
        setattr(item, field, getattr(data, field))
    item.location_id = location.id
    db.commit()
    db.refresh(item)
    return equipment_dict(item, db)

@app.get("/api/equipment/{equipment_id}/history")
def equipment_history(equipment_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    item = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    tickets = db.query(models.Ticket).filter_by(equipment_id=equipment_id).order_by(models.Ticket.created_at.desc()).all()
    result = []
    for ticket in tickets:
        changes = db.query(models.TicketHistory).filter_by(ticket_id=ticket.id).order_by(models.TicketHistory.created_at.asc()).all()
        result.append({"ticket_id": ticket.id, "description": ticket.description, "status": ticket.status,
                       "created_at": str(ticket.created_at) if ticket.created_at else "",
                       "history": [{"status": h.status, "actor": h.actor, "created_at": str(h.created_at) if h.created_at else ""} for h in changes]})
    return result

@app.patch("/api/equipment/{equipment_id}/status")
def set_equipment_status(equipment_id: int, data: dict, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    item = db.query(models.Equipment).filter_by(id=equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Оборудование не найдено")
    allowed = ["Исправно", "Неисправно", "На обслуживании"]
    status = data.get("status")
    if status not in allowed:
        raise HTTPException(status_code=400, detail="Недопустимое состояние оборудования")
    item.status = status
    db.commit()
    return {"message": "Состояние оборудования обновлено", "status": item.status}


# Управление помещениями (доступно авторизованному сотруднику).
@app.get("/api/rooms")
def list_rooms(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    rooms = db.query(models.Location).order_by(models.Location.building, models.Location.floor, models.Location.room).all()
    return [{"id": r.id, "building": r.building, "floor": r.floor, "room": r.room,
             "equipment_count": db.query(models.Equipment).filter_by(location_id=r.id).count()} for r in rooms]

@app.post("/api/rooms")
def create_room(data: dict, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    room = str(data.get("room", "")).strip()
    building = str(data.get("building", "Главный корпус")).strip() or "Главный корпус"
    floor = str(data.get("floor", "1")).strip() or "1"
    if not room:
        raise HTTPException(status_code=400, detail="Укажите номер кабинета")
    existing = db.query(models.Location).filter_by(building=building, floor=floor, room=room).first()
    if existing:
        raise HTTPException(status_code=409, detail="Такой кабинет уже существует")
    location = models.Location(building=building, floor=floor, room=room)
    db.add(location); db.commit(); db.refresh(location)
    return {"id": location.id, "building": location.building, "floor": location.floor, "room": location.room, "equipment_count": 0}

@app.delete("/api/rooms/{room_id}")
def delete_room(room_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    location = db.query(models.Location).filter_by(id=room_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Кабинет не найден")
    count = db.query(models.Equipment).filter_by(location_id=room_id).count()
    if count:
        raise HTTPException(status_code=409, detail=f"Нельзя удалить кабинет: в нём числится оборудования: {count}")
    db.delete(location); db.commit()
    return {"message": "Кабинет удалён"}

@app.get("/api/users")
def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    return [{"id": u.id, "login": u.login, "role": u.role} for u in db.query(models.User).order_by(models.User.login).all()]

@app.post("/api/users", status_code=201)
def create_user(data: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    login = data.login.strip()
    if len(login) < 3 or len(login) > 40:
        raise HTTPException(status_code=400, detail="Логин должен содержать от 3 до 40 символов")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Пароль должен содержать не менее 8 символов")
    if data.role not in ("admin", "employee"):
        raise HTTPException(status_code=400, detail="Допустимые роли: admin, employee")
    if db.query(models.User).filter_by(login=login).first():
        raise HTTPException(status_code=409, detail="Пользователь с таким логином уже существует")
    user = models.User(login=login, password_hash=hash_password(data.password), role=data.role)
    db.add(user); db.commit(); db.refresh(user)
    return {"id": user.id, "login": user.login, "role": user.role}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить собственную учётную запись")
    if user.role == "admin":
        admins_count = db.query(models.User).filter_by(role="admin").count()
        if admins_count <= 1:
            raise HTTPException(status_code=400, detail="Нельзя удалить последнего администратора")
    db.delete(user)
    db.commit()
    return {"message": "Пользователь удалён", "id": user_id}
