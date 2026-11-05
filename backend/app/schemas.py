from pydantic import BaseModel
from typing import Optional

class EquipmentCreate(BaseModel):
    name: str
    inventory_number: str
    type: str = "Компьютер"
    characteristics: str = ""
    status: str = "Исправно"
    room: str = "214"
    building: str = "Главный корпус"
    floor: str = "1"

class TicketCreate(BaseModel):
    equipment_id: int
    description: str
    category: str = "Не определена"

class TicketUpdate(BaseModel):
    status: str
    comment: str = ""
    assigned_to: Optional[str] = None

class LoginRequest(BaseModel):
    login: str
    password: str


class UserCreate(BaseModel):
    login: str
    password: str
    role: str = "employee"


class TicketBulkDelete(BaseModel):
    ids: list[int]
