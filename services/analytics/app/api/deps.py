from __future__ import annotations

from fastapi import Request

from app.config import Settings
from app.data.db import Database
from app.data.namespace import NamespaceDecision
from app.data.paths import DataLayout
from app.state.connection import StateDB


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_layout(request: Request) -> DataLayout:
    return request.app.state.layout


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_namespace(request: Request) -> NamespaceDecision:
    return request.app.state.namespace


def get_state_db(request: Request) -> StateDB:
    return request.app.state.state_db
