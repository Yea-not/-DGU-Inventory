from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    login = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="admin")

class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    building = Column(String, default="Главный корпус")
    floor = Column(String, default="1")
    room = Column(String, nullable=False)

class Equipment(Base):
    __tablename__ = "equipment"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    inventory_number = Column(String, unique=True, index=True, nullable=False)
    type = Column(String, default="Компьютер")
    characteristics = Column(Text, default="")
    status = Column(String, default="Исправно")
    location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, default="Не определена")
    status = Column(String, default="Новая")
    comment = Column(Text, default="")
    assigned_to = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TicketHistory(Base):
    __tablename__ = "ticket_history"
    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    status = Column(String, nullable=False)
    actor = Column(String, default="admin")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class InventoryCheck(Base):
    __tablename__ = "inventory_checks"
    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    checked_by = Column(String, default="admin")
    checked_at = Column(DateTime(timezone=True), server_default=func.now())
