"""
Servidor Web Local — Regcheq Análisis de Perfiles
Corre en http://localhost:5050
"""
import io
import os
import sys
import time
import threading
from datetime import datetime

from flask import Flask, render_template_string, request, jsonify, send_file

# Asegurar que el módulo encuentra sus dependencias
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import regcheq_client as api
from motor_decision import evaluar_crimenes, _cargar_catalogo, _init

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB upload

# ─── HTML TEMPLATE ────────────────────────────────────────────────────────────
HTML = """
<!DOCTYPE html>
<html lang="es" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Regcheq — Análisis de Perfiles</title>
<style>
  /* ══ TEMA OSCURO (default) ══ */
  :root {
    --bg:            #0f1117;
    --surface:       #1a1d27;
    --surface2:      #22263a;
    --surface3:      #2a2f45;
    --border:        #2e3347;
    --primary:       #4f8ef7;
    --primary-hover: #6ba3ff;
    --danger:        #e05252;
    --warn:          #e09a2e;
    --success:       #3dbf74;
    --text:          #e0e4f0;
    --muted:         #7a8099;
    --radius:        10px;
    --shadow:        0 4px 24px rgba(0,0,0,.35);
    --hit-bg:        rgba(224,82,82,.07);
    --hit-border:    rgba(224,82,82,.45);
    --detail-bg:     rgba(0,0,0,.25);
    --detail-text:   #b0bec5;
    --toggle-bg:     #2a2f45;
  }

  /* ══ TEMA CLARO ══ */
  [data-theme="light"] {
    --bg:            #f0f2f8;
    --surface:       #ffffff;
    --surface2:      #f4f6fb;
    --surface3:      #e8ecf5;
    --border:        #d0d6e8;
    --primary:       #2563eb;
    --primary-hover: #1d4ed8;
    --danger:        #dc2626;
    --warn:          #d97706;
    --success:       #16a34a;
    --text:          #1e2235;
    --muted:         #64748b;
    --shadow:        0 4px 24px rgba(0,0,0,.10);
    --hit-bg:        rgba(220,38,38,.05);
    --hit-border:    rgba(220,38,38,.35);
    --detail-bg:     rgba(0,0,0,.04);
    --detail-text:   #475569;
    --toggle-bg:     #e8ecf5;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text);
    font-family: 'Inter', system-ui, sans-serif; min-height: 100vh;
    transition: background .25s, color .25s;
  }

  /* ══ NAV ══ */
  nav {
    background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 0 28px; display: flex; align-items: center; gap: 20px; height: 58px;
    position: sticky; top: 0; z-index: 100; box-shadow: var(--shadow);
    transition: background .25s, border-color .25s;
  }
  nav .logo { font-weight: 800; font-size: 17px; color: var(--primary); letter-spacing: -.4px; white-space: nowrap; }
  nav .logo span { color: var(--text); font-weight: 500; }
  .nav-tabs { display: flex; gap: 4px; }
  .tab { padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
         color: var(--muted); border: none; background: none; transition: .15s; font-weight: 500; }
  .tab:hover { color: var(--text); background: var(--surface2); }
  .tab.active { background: var(--primary); color: #fff; font-weight: 700; }
  .nav-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  #theme-icon { font-size: 16px; line-height: 1; }
  #theme-btn {
    width: 42px; height: 24px; border-radius: 12px; border: 1.5px solid var(--border);
    background: var(--toggle-bg); cursor: pointer; position: relative;
    transition: background .2s; display: flex; align-items: center; padding: 3px;
  }
  #theme-btn::after {
    content: ''; width: 16px; height: 16px; border-radius: 50%;
    background: var(--primary); transition: transform .2s;
  }
  [data-theme="light"] #theme-btn::after { transform: translateX(18px); }

  /* ══ LAYOUT ══ */
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
  .panel { display: none; }
  .panel.active { display: block; }

  /* ══ CARDS ══ */
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 28px; margin-bottom: 24px;
    box-shadow: var(--shadow); transition: background .25s, border-color .25s;
  }
  .card-title { font-size: 13px; font-weight: 700; margin-bottom: 20px; color: var(--primary);
                text-transform: uppercase; letter-spacing: .6px; }

  /* ══ FORM ══ */
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  label { font-size: 11px; color: var(--muted); font-weight: 600;
          text-transform: uppercase; letter-spacing: .5px; }
  input, select {
    background: var(--surface2); border: 1px solid var(--border); color: var(--text);
    border-radius: 6px; padding: 9px 12px; font-size: 14px; outline: none;
    transition: border-color .15s, background .25s;
  }
  input:focus, select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(79,142,247,.15); }
  input::placeholder { color: var(--muted); }

  /* ══ TOGGLE TYPE ══ */
  .toggle-group {
    display: flex; gap: 0; border-radius: 6px; overflow: hidden;
    border: 1px solid var(--border); width: fit-content; margin-bottom: 22px;
  }
  .toggle-btn { padding: 8px 20px; background: var(--surface2); color: var(--muted);
                border: none; cursor: pointer; font-size: 13px; transition: .15s; font-weight: 500; }
  .toggle-btn.active { background: var(--primary); color: #fff; font-weight: 700; }

  /* ══ BUTTONS ══ */
  .btn {
    padding: 10px 22px; border-radius: 7px; border: none; cursor: pointer;
    font-size: 14px; font-weight: 600; transition: .15s;
    display: inline-flex; align-items: center; gap: 8px;
  }
  .btn-primary { background: var(--primary); color: #fff; }
  .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
  .btn-outline { background: transparent; color: var(--primary); border: 1.5px solid var(--primary); }
  .btn-outline:hover { background: var(--primary); color: #fff; }
  .btn:disabled { opacity: .4; cursor: not-allowed; transform: none !important; }
  .btn-group { display: flex; gap: 12px; margin-top: 22px; align-items: center; }

  /* ══ UPLOAD ══ */
  .upload-area {
    border: 2px dashed var(--border); border-radius: var(--radius);
    padding: 44px 32px; text-align: center; cursor: pointer; transition: .2s;
  }
  .upload-area:hover, .upload-area.dragover { border-color: var(--primary); background: rgba(79,142,247,.05); }
  .upload-area input { display: none; }
  .upload-icon { font-size: 44px; margin-bottom: 12px; }
  .upload-hint { color: var(--muted); font-size: 13px; margin-top: 10px; line-height: 1.8; }
  .upload-hint code { background: var(--surface2); padding: 1px 7px; border-radius: 4px;
                      font-size: 12px; color: var(--primary); border: 1px solid var(--border); }

  /* ══ RESULT ══ */
  #result { margin-top: 28px; }
  .result-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .result-name { font-size: 20px; font-weight: 700; }

  /* badges */
  .badge { padding: 3px 11px; border-radius: 20px; font-size: 11px; font-weight: 800;
           text-transform: uppercase; letter-spacing: .6px; white-space: nowrap; }
  .badge-high   { background: rgba(224,82,82,.18);  color: #ff6b6b; border: 1px solid rgba(224,82,82,.45); }
  .badge-medium { background: rgba(224,154,46,.18); color: #ffc107; border: 1px solid rgba(224,154,46,.45); }
  .badge-low    { background: rgba(61,191,116,.18); color: #3dbf74; border: 1px solid rgba(61,191,116,.4); }
  .badge-none   { background: var(--surface2); color: var(--muted); border: 1px solid var(--border); }
  .badge-fb     { background: rgba(224,82,82,.28); color: #ff6b6b; border: 1px solid #e05252; }
  .badge-ucr    { background: rgba(224,154,46,.25); color: #ffc107; border: 1px solid var(--warn); }
  .badge-lib    { background: rgba(61,191,116,.18); color: #3dbf74; border: 1px solid var(--success); }
  .badge-pep    { background: rgba(139,92,246,.18); color: #a78bfa; border: 1px solid rgba(139,92,246,.4); }

  .section-title {
    font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase;
    letter-spacing: .8px; margin: 28px 0 14px;
    display: flex; align-items: center; gap: 10px;
  }
  .section-title::after { content:''; flex:1; height:1px; background: var(--border); }

  /* ══ LIST ITEMS (coincidencias) ══ */
  .lists-grid { display: flex; flex-direction: column; gap: 8px; }
  .list-item { border-radius: 8px; border: 1px solid var(--border); background: var(--surface2); overflow: hidden; transition: border-color .15s; }
  .list-item.hit { border-color: var(--hit-border); background: var(--hit-bg); }

  .list-item-header {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 16px; font-size: 13px;
  }
  .list-item.hit .list-item-header { cursor: pointer; }
  .list-item.hit .list-item-header:hover { filter: brightness(1.06); }

  .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .dot-green { background: var(--success); box-shadow: 0 0 6px rgba(61,191,116,.4); }
  .dot-red   { background: var(--danger);  box-shadow: 0 0 6px rgba(224,82,82,.5); }
  .dot-warn  { background: var(--warn);    box-shadow: 0 0 6px rgba(224,154,46,.5); }

  .list-name { flex: 1; font-weight: 500; }
  .list-risk { font-size: 11px; font-weight: 800; letter-spacing: .3px; }
  .risk-high   { color: var(--danger); }
  .risk-medium { color: var(--warn); }
  .risk-low    { color: var(--success); }

  .chevron { font-size: 10px; color: var(--muted); transition: transform .2s; margin-left: 4px; }
  .chevron.open { transform: rotate(180deg); }

  /* ══ DETALLE DE COINCIDENCIA ══ */
  .list-detail { display: none; padding: 6px 16px 16px 35px; }
  .list-detail.open { display: block; }

  /* Contador de registros */
  .detail-count {
    font-size: 11px; color: var(--muted); margin-bottom: 8px; font-weight: 600;
    text-transform: uppercase; letter-spacing: .4px;
  }

  /* Tabla de detalle */
  .detail-table-wrap {
    overflow-x: auto; border-radius: 7px;
    border: 1px solid var(--hit-border);
  }
  .detail-table {
    width: 100%; border-collapse: collapse; font-size: 12px;
  }
  .detail-table thead tr {
    background: rgba(224,82,82,.13);
  }
  [data-theme="light"] .detail-table thead tr {
    background: rgba(220,38,38,.08);
  }
  .detail-table th {
    padding: 8px 12px; text-align: left; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .5px;
    color: var(--danger); border-bottom: 1px solid var(--hit-border);
    white-space: nowrap; background: transparent;
  }
  .detail-table td {
    padding: 8px 12px; border-bottom: 1px solid var(--border);
    color: var(--detail-text); vertical-align: top; word-break: break-word;
  }
  .detail-table tr:last-child td { border-bottom: none; }
  .detail-table tr:hover td { background: var(--surface3); }
  .detail-table td.td-highlight {
    color: var(--danger); font-weight: 700;
  }
  .detail-table td.td-badge {
    white-space: nowrap;
  }
  /* Metadata sobre la tabla (nombre imputado, término buscado, etc.) */
  .detail-meta {
    display: flex; flex-wrap: wrap; gap: 6px 18px;
    background: rgba(224,82,82,.07); border: 1px solid var(--hit-border);
    border-radius: 7px 7px 0 0; padding: 8px 14px;
    font-size: 12px; color: var(--text);
    border-bottom: none;
  }
  [data-theme="light"] .detail-meta {
    background: rgba(220,38,38,.05);
  }
  .detail-meta strong { color: var(--danger); margin-right: 4px; }
  .detail-meta + .detail-table-wrap { border-radius: 0 0 7px 7px; }

  /* Celda centrada (para badges de riesgo) */
  .detail-table td.td-center { text-align: center; vertical-align: middle; }

  /* Fallback para string/raw */
  .detail-raw {
    font-family: monospace; font-size: 11px; color: var(--detail-text);
    background: var(--surface3); padding: 10px 12px; border-radius: 6px;
    word-break: break-all; white-space: pre-wrap;
    border: 1px solid var(--border);
  }

  /* ══ FIELD GRID ══ */
  .field-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
  .field-item { background: var(--surface2); border-radius: 8px; padding: 12px 14px; border: 1px solid var(--border); }
  .field-label { font-size: 10px; color: var(--muted); margin-bottom: 5px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
  .field-value { font-size: 14px; font-weight: 600; }

  /* ══ DECISION BOX ══ */
  .decision-box { border-radius: 10px; padding: 20px 24px; margin-top: 8px; border: 1px solid; }
  .decision-box.fb  { background: rgba(224,82,82,.1);  border-color: var(--danger); }
  .decision-box.ucr { background: rgba(224,154,46,.1); border-color: var(--warn); }
  .decision-box.lib { background: rgba(61,191,116,.1); border-color: var(--success); }
  .decision-label   { font-size: 18px; font-weight: 800; margin-bottom: 6px; }
  .decision-reason  { font-size: 13px; color: var(--muted); margin-bottom: 10px; }
  .decision-stats   { display: flex; gap: 20px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .decision-stats b { color: var(--text); }

  /* ══ SPINNER ══ */
  .spinner { display: none; width: 18px; height: 18px; border: 2px solid rgba(255,255,255,.3);
             border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ══ PROGRESS ══ */
  .progress-bar { width: 100%; background: var(--surface2); border-radius: 4px; height: 6px; margin: 12px 0; }
  .progress-fill { height: 100%; border-radius: 4px; background: var(--primary); transition: width .3s; }
  .log-box {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 14px; font-family: monospace; font-size: 12px;
    max-height: 280px; overflow-y: auto; color: var(--muted); line-height: 1.7;
  }
  .log-box .ok   { color: var(--success); }
  .log-box .err  { color: var(--danger); }
  .log-box .info { color: var(--primary); }

  /* ══ TABLE ══ */
  .table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: var(--surface2); color: var(--muted); padding: 10px 14px; text-align: left;
       font-size: 11px; text-transform: uppercase; letter-spacing: .5px; font-weight: 700; white-space: nowrap; }
  td { padding: 9px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--surface3); }

  /* ══ ALERTS ══ */
  .alert { border-radius: 8px; padding: 14px 18px; font-size: 13px; margin-bottom: 0; border: 1px solid; }
  .alert-err  { background: rgba(224,82,82,.1);  color: var(--danger);  border-color: rgba(224,82,82,.3); }
  .alert-ok   { background: rgba(61,191,116,.08);  color: var(--success); border-color: rgba(61,191,116,.3); }
  .alert-info { background: rgba(79,142,247,.1); color: var(--primary); border-color: rgba(79,142,247,.3); }

  /* ══ STATS ROW (masivo) ══ */
  .stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
  .stat-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 14px 18px; text-align: center; min-width: 90px; }
  .stat-num  { font-size: 26px; font-weight: 800; }
  .stat-lbl  { font-size: 11px; color: var(--muted); margin-top: 3px; text-transform: uppercase; letter-spacing: .4px; }
  .s-high { color: var(--danger); }
  .s-warn { color: var(--warn); }
  .s-ok   { color: var(--success); }

  @media (max-width: 640px) {
    .grid2, .grid3 { grid-template-columns: 1fr; }
    nav { gap: 8px; padding: 0 14px; }
    .nav-tabs { gap: 2px; }
    .tab { padding: 5px 10px; font-size: 12px; }
  }

  /* ══ SORT HEADERS ══ */
  .detail-table th.sortable-hdr {
    cursor: pointer; user-select: none; position: relative;
    padding-right: 22px;
  }
  .detail-table th.sortable-hdr:hover { background: rgba(224,82,82,.18); }
  .detail-table th.sortable-hdr::after {
    content: '⇅'; position: absolute; right: 6px; top: 50%;
    transform: translateY(-50%); font-size: 10px; color: var(--muted);
  }
  .detail-table th.sort-asc::after  { content: '▲'; color: var(--danger); }
  .detail-table th.sort-desc::after { content: '▼'; color: var(--danger); }

  /* ══ RUC TOOLTIP ══ */
  .ruc-dup-badge {
    display: inline-block; font-size: 9px; font-weight: 700;
    background: rgba(224,82,82,.2); color: var(--danger);
    border: 1px solid rgba(224,82,82,.4); border-radius: 10px;
    padding: 1px 6px; margin-left: 6px; cursor: help;
    position: relative;
  }
  .ruc-dup-badge .ruc-tooltip {
    display: none; position: absolute; left: 0; top: 110%;
    z-index: 999; background: var(--surface2); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 14px; min-width: 340px;
    box-shadow: 0 8px 24px rgba(0,0,0,.35); font-size: 11px; font-weight: 400;
    color: var(--text); white-space: normal; pointer-events: none;
  }
  .ruc-dup-badge:hover .ruc-tooltip { display: block; }
  .ruc-tooltip table { width: 100%; border-collapse: collapse; }
  .ruc-tooltip th { background: rgba(224,82,82,.15); padding: 4px 8px; font-size: 10px; }
  .ruc-tooltip td { padding: 4px 8px; border-bottom: 1px solid var(--border); }
  .ruc-tooltip tr:last-child td { border-bottom: none; }

  /* ══ CAROUSEL ══ */
  .carousel-header {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border);
  }
  .carousel-nav { display: flex; align-items: center; gap: 10px; }
  .carousel-btn { padding: 6px 14px !important; font-size: 12px !important; }
  .carousel-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-left: auto; }
  .carousel-card-inner { animation: fadeIn .2s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  /* ══ PRINT ══ */
  @media print {
    nav, .nav-tabs, #theme-btn, .tab, .btn-group, .carousel-nav,
    .carousel-actions, #upload-area, #masivo-progress,
    .log-box, .stats-row { display: none !important; }
    body { background: #fff !important; color: #000 !important; }
    .card { box-shadow: none !important; border: 1px solid #ccc !important; page-break-inside: avoid; }
    .detail-table-wrap { overflow: visible !important; }
    .detail-table { font-size: 10px; }
    [data-theme="dark"] { --bg: #fff; --text: #000; --muted: #555; --border: #ccc;
                          --surface2: #f5f5f5; --surface3: #eee; }
  }
</style>
</head>
<body>

<nav>
  <div class="logo">Regcheq<span> · Análisis</span></div>
  <div class="nav-tabs">
    <button class="tab active" onclick="setTab('individual', this)">Persona Individual</button>
    <button class="tab" onclick="setTab('masivo', this)">Consulta Masiva</button>
    <button class="tab" onclick="setTab('lista', this)">Lista de Interés</button>
  </div>
  <div class="nav-right">
    <span id="theme-icon" title="Cambiar tema">🌙</span>
    <button id="theme-btn" onclick="toggleTheme()" title="Cambiar entre modo oscuro y claro"></button>
  </div>
</nav>

<!-- ══════════════════════════════════════════════════════
     PANEL 1 — INDIVIDUAL
══════════════════════════════════════════════════════ -->
<div id="panel-individual" class="panel active">
<div class="container">

  <div class="card">
    <div class="card-title">Tipo de persona</div>
    <div class="toggle-group">
      <button class="toggle-btn active" onclick="setTipo('natural', this)">👤 Persona Natural</button>
      <button class="toggle-btn"        onclick="setTipo('legal', this)">🏢 Empresa / Jurídica</button>
    </div>
    <input type="hidden" id="tipo-persona" value="natural">

    <!-- Natural -->
    <div id="form-natural">
      <div class="grid3" style="margin-bottom:16px">
        <div class="form-group">
          <label>DNI / RUT *</label>
          <input id="nat-dni" type="text" placeholder="12345678">
        </div>
        <div class="form-group">
          <label>Nombre</label>
          <input id="nat-nombre" type="text" placeholder="PEDRO">
        </div>
        <div class="form-group">
          <label>Apellido paterno</label>
          <input id="nat-apellido" type="text" placeholder="PEREZ">
        </div>
      </div>
      <div class="grid3" style="margin-bottom:16px">
        <div class="form-group">
          <label>Apellido materno</label>
          <input id="nat-apellido2" type="text" placeholder="GONZALEZ">
        </div>
        <div class="form-group">
          <label>Nacionalidad</label>
          <input id="nat-nac" type="text" placeholder="Chile">
        </div>
        <div class="form-group">
          <label>Cargo / Posición</label>
          <input id="nat-cargo" type="text" placeholder="Gerente">
        </div>
      </div>
      <div class="grid2">
        <div class="form-group">
          <label>Email</label>
          <input id="nat-email" type="email" placeholder="correo@ejemplo.cl">
        </div>
        <div class="form-group">
          <label>Teléfono</label>
          <input id="nat-tel" type="text" placeholder="+56912345678">
        </div>
      </div>
    </div>

    <!-- Legal -->
    <div id="form-legal" style="display:none">
      <div class="grid3" style="margin-bottom:16px">
        <div class="form-group">
          <label>RUT Empresa *</label>
          <input id="leg-rut" type="text" placeholder="76123456-7">
        </div>
        <div class="form-group">
          <label>Razón Social</label>
          <input id="leg-razon" type="text" placeholder="Empresa SA">
        </div>
        <div class="form-group">
          <label>Tipo de empresa</label>
          <input id="leg-tipo" type="text" placeholder="Sociedad Anónima">
        </div>
      </div>
      <div class="grid2" style="margin-bottom:16px">
        <div class="form-group">
          <label>RUT Representante</label>
          <input id="leg-rep-dni" type="text" placeholder="12345678">
        </div>
        <div class="form-group">
          <label>Nombre Representante</label>
          <input id="leg-rep-nombre" type="text" placeholder="PEDRO PEREZ">
        </div>
      </div>
      <div class="grid2">
        <div class="form-group">
          <label>Email empresa</label>
          <input id="leg-email" type="email" placeholder="contacto@empresa.cl">
        </div>
        <div class="form-group">
          <label>País</label>
          <input id="leg-pais" type="text" placeholder="Chile">
        </div>
      </div>
    </div>

    <div class="btn-group">
      <button class="btn btn-primary" onclick="analizarPerfil()">
        <span id="btn-spinner" class="spinner"></span>
        🔍 Analizar perfil
      </button>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;
                    color:var(--muted);text-transform:none;letter-spacing:0;font-weight:500">
        <input type="checkbox" id="chk-crear" style="width:16px;height:16px;accent-color:var(--primary)">
        Crear/actualizar ficha primero
      </label>
    </div>
  </div>

  <div id="result"></div>

</div>
</div>

<!-- ══════════════════════════════════════════════════════
     PANEL 2 — MASIVO
══════════════════════════════════════════════════════ -->
<div id="panel-masivo" class="panel">
<div class="container">

  <div class="card">
    <div class="card-title">📂 Consulta masiva por Excel</div>

    <div class="upload-area" id="upload-area"
         onclick="document.getElementById('file-input').click()"
         ondragover="event.preventDefault();this.classList.add('dragover')"
         ondragleave="this.classList.remove('dragover')"
         ondrop="handleDrop(event)">
      <div class="upload-icon">📊</div>
      <div id="upload-label" style="font-size:15px;font-weight:600;margin-bottom:4px">
        Arrastra tu Excel aquí o haz clic para seleccionar
      </div>
      <div class="upload-hint">
        Formato: <code>.xlsx</code><br>
        Columna obligatoria: <code>rut</code> o <code>dni</code> (cualquier capitalización: DNI, RUT, Rut…)<br>
        Columnas opcionales: <code>Nombre</code> &nbsp;·&nbsp; <code>Apellido paterno</code> &nbsp;·&nbsp;
        <code>Razón Social</code> &nbsp;·&nbsp; <code>Tipo de persona</code>
      </div>
      <input type="file" id="file-input" accept=".xlsx" onchange="fileSelected(this)">
    </div>

    <div style="margin-top:22px;display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;
                    color:var(--muted);text-transform:none;letter-spacing:0;font-weight:500">
        <input type="checkbox" id="chk-crear-masivo" style="width:16px;height:16px;accent-color:var(--primary)">
        Crear fichas antes de consultar
      </label>
      <div class="form-group" style="flex-direction:row;align-items:center;gap:8px">
        <label style="white-space:nowrap">Delay (seg)</label>
        <input id="delay-input" type="number" value="0.5" step="0.1" min="0" style="width:75px">
      </div>
      <div class="form-group" style="flex-direction:row;align-items:center;gap:8px">
        <label style="white-space:nowrap">Límite filas</label>
        <input id="limite-input" type="number" value="0" min="0" style="width:90px" placeholder="0=todas">
      </div>
    </div>

    <div class="btn-group">
      <button class="btn btn-primary" id="btn-procesar" onclick="procesarMasivo()" disabled>
        <span id="btn-spinner-masivo" class="spinner"></span>
        ⚡ Procesar y descargar
      </button>
    </div>
  </div>

  <!-- Progreso -->
  <div id="masivo-progress" style="display:none" class="card">
    <div class="card-title">Progreso</div>
    <div id="prog-text" style="font-size:13px;color:var(--muted);margin-bottom:8px">Iniciando...</div>
    <div class="progress-bar"><div class="progress-fill" id="prog-bar" style="width:0%"></div></div>
    <div class="log-box" id="log-box"></div>
    <div id="masivo-stats" class="stats-row" style="display:none">
      <div class="stat-card"><div class="stat-num" id="stat-total">0</div><div class="stat-lbl">Total</div></div>
      <div class="stat-card"><div class="stat-num s-high" id="stat-high">0</div><div class="stat-lbl">Alto riesgo</div></div>
      <div class="stat-card"><div class="stat-num s-warn" id="stat-alerts">0</div><div class="stat-lbl">Con alertas</div></div>
      <div class="stat-card"><div class="stat-num s-ok" id="stat-ok">0</div><div class="stat-lbl">Sin alertas</div></div>
      <div class="stat-card"><div class="stat-num" id="stat-err" style="color:var(--muted)">0</div><div class="stat-lbl">Errores</div></div>
    </div>
  </div>

  <!-- Carrusel de resultados -->
  <div id="masivo-carousel" style="display:none">
    <div class="card">
      <div class="carousel-header">
        <div class="carousel-nav">
          <button class="btn btn-outline carousel-btn" onclick="carouselPrev()">◀ Anterior</button>
          <span id="carousel-pos" style="font-size:14px;font-weight:700;color:var(--text)">1 / 1</span>
          <button class="btn btn-outline carousel-btn" onclick="carouselNext()">Siguiente ▶</button>
        </div>
        <div class="carousel-actions">
          <input id="carousel-search" type="text" placeholder="🔍 Filtrar por DNI o nombre…"
                 oninput="carouselFilter(this.value)"
                 style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);
                        background:var(--surface2);color:var(--text);font-size:13px;width:240px">
          <button class="btn btn-primary" onclick="carouselPDF()">📄 PDF ficha actual</button>
          <button class="btn btn-outline" onclick="carouselPDFAll()">📋 PDF todas las fichas</button>
        </div>
      </div>
      <div id="carousel-card"></div>
    </div>
  </div>

</div>
</div>

<!-- ══════════════════════════════════════════════════════
     PANEL 3 — LISTA DE INTERÉS
══════════════════════════════════════════════════════ -->
<div id="panel-lista" class="panel">
<div class="container">

  <div class="card">
    <div class="card-title">⭐ Lista interna de interés</div>
    <div style="display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="cargarLista()">🔄 Actualizar lista</button>
      <button class="btn btn-outline" onclick="document.getElementById('add-form').style.display='block'">
        + Agregar registro
      </button>
    </div>

    <div id="add-form" style="display:none;margin-bottom:22px;padding:22px;background:var(--surface2);border-radius:10px;border:1px solid var(--border)">
      <div class="card-title" style="margin-bottom:16px">Nuevo registro</div>
      <div class="grid3" style="margin-bottom:14px">
        <div class="form-group"><label>DNI *</label><input id="add-dni" type="text"></div>
        <div class="form-group"><label>Nombre *</label><input id="add-nombre" type="text"></div>
        <div class="form-group"><label>Tipo</label>
          <select id="add-tipo"><option value="natural">Natural</option><option value="legal">Legal</option></select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label>Razón *</label>
        <input id="add-razon" type="text" placeholder="PEP detectado / Coincidencia GAFI / ...">
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" onclick="agregarLista()">Guardar</button>
        <button class="btn btn-outline" onclick="document.getElementById('add-form').style.display='none'">Cancelar</button>
      </div>
    </div>

    <div id="lista-content">
      <div style="color:var(--muted);font-size:13px">Haz clic en "Actualizar lista" para cargar los registros.</div>
    </div>
  </div>

</div>
</div>

<!-- ══════════════════════════════════════════════════════ SCRIPTS -->
<script>
// ── THEME TOGGLE ──────────────────────────────────────
function toggleTheme() {
  const html  = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const next   = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  document.getElementById('theme-icon').textContent = next === 'dark' ? '🌙' : '☀️';
  localStorage.setItem('regcheq-theme', next);
}
(function() {
  const saved = localStorage.getItem('regcheq-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-icon').textContent = saved === 'dark' ? '🌙' : '☀️';
})();

// ── TABS ──────────────────────────────────────────────
function setTab(name, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'lista') cargarLista();
}
function setTipo(tipo, btn) {
  document.getElementById('tipo-persona').value = tipo;
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('form-natural').style.display = tipo === 'natural' ? '' : 'none';
  document.getElementById('form-legal').style.display   = tipo === 'legal'   ? '' : 'none';
  document.getElementById('result').innerHTML = '';
}

// ── ANÁLISIS INDIVIDUAL ───────────────────────────────
async function analizarPerfil() {
  const tipo  = document.getElementById('tipo-persona').value;
  const crear = document.getElementById('chk-crear').checked;
  let payload = { tipo, crear_ficha: crear };

  if (tipo === 'natural') {
    payload.dni          = document.getElementById('nat-dni').value.trim();
    payload.nombre       = document.getElementById('nat-nombre').value.trim();
    payload.apellido     = document.getElementById('nat-apellido').value.trim();
    payload.apellido2    = document.getElementById('nat-apellido2').value.trim();
    payload.nacionalidad = document.getElementById('nat-nac').value.trim();
    payload.cargo        = document.getElementById('nat-cargo').value.trim();
    payload.email        = document.getElementById('nat-email').value.trim();
    payload.telefono     = document.getElementById('nat-tel').value.trim();
    if (!payload.dni) return showErr('result', 'El campo DNI es obligatorio');
  } else {
    payload.dni          = document.getElementById('leg-rut').value.trim();
    payload.razon_social = document.getElementById('leg-razon').value.trim();
    payload.tipo_empresa = document.getElementById('leg-tipo').value.trim();
    payload.rep_dni      = document.getElementById('leg-rep-dni').value.trim();
    payload.rep_nombre   = document.getElementById('leg-rep-nombre').value.trim();
    payload.email        = document.getElementById('leg-email').value.trim();
    payload.pais         = document.getElementById('leg-pais').value.trim();
    if (!payload.dni) return showErr('result', 'El campo RUT es obligatorio');
  }

  setLoading(true);
  document.getElementById('result').innerHTML = '';
  try {
    const res  = await fetch('/api/analizar', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) return showErr('result', data.error);
    renderResultado(data);
  } catch(e) {
    setLoading(false);
    showErr('result', 'Error de conexión: ' + e.message);
  }
}
function setLoading(on) {
  document.getElementById('btn-spinner').style.display = on ? 'block' : 'none';
  document.querySelector('#panel-individual .btn-primary').disabled = on;
}
function showErr(targetId, msg) {
  document.getElementById(targetId).innerHTML =
    `<div class="alert alert-err">⚠ ${msg}</div>`;
}

// ── BADGES ────────────────────────────────────────────
function riskBadge(r) {
  if (!r) return '<span class="badge badge-none">—</span>';
  const key = (r||'').toLowerCase();
  const cls = { high:'badge-high', 'high risk':'badge-high', medium:'badge-medium', low:'badge-low' }[key] || 'badge-none';
  const lbl = { high:'⚠ ALTO', 'high risk':'⚠ ALTO', medium:'⚡ MEDIO', low:'✓ BAJO' }[key] || r.toUpperCase();
  return `<span class="badge ${cls}">${lbl}</span>`;
}
function decisionClass(d) {
  if (!d) return '';
  if (d === 'FORZAR_BLOQUEO') return 'fb';
  if (d === 'UNDER_COMPLIANCE_REVIEW') return 'ucr';
  return 'lib';
}

// ── RENDER DETALLE DE COINCIDENCIA (tabla) ────────────

const HIGHLIGHT_KEYS = new Set([
  'name','nombre','fullname','fullName','alias','aliases',
  'entity','entidad','sanctionname','sanctionName',
  'program','programa','source','fuente','list','lista',
  'description','descripcion','nationality','nacionalidad',
  'cargo','position','type','tipo'
]);

// Columnas a omitir (metadata interna de la API)
const SKIP_KEYS = new Set([
  'dni','personType','listResult','lastChecked','_id','__v',
  'searcher_id','assignee_id','client_ref','id','ref',
  'searcher','assignee','limit','offset','tags','labels',
  'filters','created_at','updated_at'
]);

function formatVal(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓ Sí' : '✗ No';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    // Si son objetos, tomar la clave más relevante
    if (typeof v[0] === 'object' && v[0] !== null) {
      return v.map(o => o.name || o.value || o.source || JSON.stringify(o)).join(' · ');
    }
    return v.join(' · ');
  }
  if (typeof v === 'object') {
    // Objeto: mostrar sus campos relevantes como "clave: valor"
    const parts = Object.entries(v)
      .filter(([k, val]) => val !== null && val !== undefined && !SKIP_KEYS.has(k))
      .map(([k, val]) => `${k}: ${val}`);
    return parts.length ? parts.join(' | ') : JSON.stringify(v);
  }
  return String(v);
}

// ── Traducciones de columnas para causas penales ───────────────────────
const COL_LABELS = {
  crimen:'Delito', estado:'Estado', fecha:'Fecha', riesgo:'Riesgo',
  rit:'RIT', ruc:'RUC', tribunal:'Tribunal',
  name:'Nombre', entity_type:'Tipo entidad', score:'Score',
  match_status:'Estado match', risk_level:'Nivel riesgo',
  search_term:'Término buscado', total_hits:'Total hits',
  total_matches:'Total coincidencias'
};

// ── Normalizar data de la API a {meta, items} ──────────────────────────
function normalizarData(dataField) {
  if (dataField === null || dataField === undefined) return { meta: null, items: null };

  // Ya es un array directo → cada elemento es una fila
  if (Array.isArray(dataField)) {
    if (dataField.length === 0) return { meta: null, items: [] };
    return {
      meta: null,
      items: dataField.map(item =>
        (typeof item === 'object' && item !== null) ? item : { valor: item }
      )
    };
  }

  // Es un dict → detectar el patrón
  if (typeof dataField === 'object') {

    // ── Patrón causas penales (secondCriminalCasesChile):
    //    data.additionalData es un ARRAY directo de causas ──
    const adData = dataField.additionalData;
    if (Array.isArray(adData) && adData.length > 0 &&
        adData[0] && ('crimen' in adData[0] || 'tribunal' in adData[0] || 'ruc' in adData[0])) {
      const info = dataField.info || {};
      const meta = [];
      if (info.name)          meta.push({ label: 'Imputado', value: info.name });
      if (info.rut)           meta.push({ label: 'RUT', value: info.rut });
      if (info.total_matches) meta.push({ label: 'Total causas', value: info.total_matches });
      return { meta: meta.length ? meta : null, items: adData };
    }

    // ── Patrón screeningGlobal: additionalData.hits[].doc ──
    const hits = adData?.hits;
    if (Array.isArray(hits) && hits.length > 0) {
      const adInfo = dataField.additionalData || {};
      const meta = [];
      if (adInfo.search_term)    meta.push({ label: 'Término buscado', value: adInfo.search_term });
      if (adInfo.total_matches)  meta.push({ label: 'Total coincidencias', value: adInfo.total_matches });
      if (adInfo.match_status)   meta.push({ label: 'Estado', value: adInfo.match_status });

      const items = hits.map(h => {
        const doc = h.doc || {};
        const row = {};
        if (doc.name)        row['Nombre']              = doc.name;
        if (doc.entity_type) row['Tipo entidad']         = doc.entity_type;
        if (Array.isArray(doc.types)  && doc.types.length)
          row['Tipos'] = doc.types.join(' · ');
        if (Array.isArray(h.match_types) && h.match_types.length)
          row['Match types'] = h.match_types.join(' · ');
        if (h.score !== undefined)
          row['Score'] = typeof h.score === 'number' ? h.score.toFixed(2) : h.score;
        if (Array.isArray(doc.sources) && doc.sources.length)
          row['Fuentes'] = doc.sources.map(s => s.name || s).join(' · ');
        if (Array.isArray(doc.aka) && doc.aka.length)
          row['También conocido como'] = doc.aka.map(a => a.name || a).slice(0, 3).join(' · ');
        if (Array.isArray(doc.fields)) {
          const fm = {};
          doc.fields.forEach(f => { if (f.name && f.value && !fm[f.name]) fm[f.name] = f.value; });
          Object.assign(row, fm);
        }
        return row;
      });
      return { meta: meta.length ? meta : null, items };
    }

    // ── Patrón genérico: buscar array de resultados dentro del dict ──
    const arrayKeys = ['matches','results','hits','records','persons','entities','data','items','list'];
    for (const key of arrayKeys) {
      if (Array.isArray(dataField[key]) && dataField[key].length > 0) {
        return {
          meta: null,
          items: dataField[key].map(item =>
            (typeof item === 'object' && item !== null) ? item : { valor: item }
          )
        };
      }
    }

    // ── Fallback: dict plano → una sola fila, filtrar metadata ──
    const fila = {};
    Object.entries(dataField).forEach(([k, v]) => {
      if (!SKIP_KEYS.has(k) && v !== null && v !== undefined) fila[k] = v;
    });
    return { meta: null, items: [Object.keys(fila).length > 0 ? fila : dataField] };
  }

  // Primitivo
  return { meta: null, items: [{ valor: String(dataField) }] };
}

// ── Celda con badge de riesgo coloreado ────────────────────────────────
function riesgoCellContent(val) {
  const k = (val || '').toString().toLowerCase();
  if (k === 'high')   return '<span class="badge badge-high">⚠ ALTO</span>';
  if (k === 'medium') return '<span class="badge badge-medium">⚡ MEDIO</span>';
  if (k === 'low')    return '<span class="badge badge-low">✓ BAJO</span>';
  return val;
}

function renderDetailEntries(dataField) {
  const { meta, items } = normalizarData(dataField);

  if (items === null)
    return '<div class="detail-raw">Sin detalle adicional de la API</div>';
  if (items.length === 0)
    return '<div class="detail-raw">Sin registros en el detalle</div>';

  // ── Header con metadata (nombre imputado, término buscado, etc.) ──
  let metaHtml = '';
  if (meta && meta.length > 0) {
    metaHtml = '<div class="detail-meta">' +
      meta.map(m => `<span><strong>${m.label}:</strong> ${m.value}</span>`).join('') +
      '</div>';
  }

  // Recopilar columnas únicas
  const colSet = new Map();
  items.forEach(item => {
    if (typeof item === 'object' && item !== null)
      Object.keys(item).forEach(k => { if (!colSet.has(k)) colSet.set(k, true); });
  });
  const cols = [...colSet.keys()].filter(k =>
    items.some(item => {
      const v = item[k];
      return v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '—';
    })
  );

  if (cols.length === 0)
    return metaHtml + '<div class="detail-raw">Sin campos con datos disponibles</div>';

  const thead = cols.map(k =>
    `<th>${COL_LABELS[k] || k}</th>`
  ).join('');

  const tbody = items.map(item => {
    if (typeof item !== 'object' || item === null)
      return `<tr><td colspan="${cols.length}">${formatVal(item)}</td></tr>`;

    const cells = cols.map(k => {
      const v       = item[k];
      const isEmpty = v === null || v === undefined || String(v).trim() === '';
      // Columna riesgo → badge coloreado
      if (k === 'riesgo' && !isEmpty) {
        return `<td class="td-center">${riesgoCellContent(v)}</td>`;
      }
      const display = isEmpty ? '—' : formatVal(v);
      const isHi    = HIGHLIGHT_KEYS.has(k) || HIGHLIGHT_KEYS.has(k.toLowerCase());
      return `<td class="${isHi && !isEmpty ? 'td-highlight' : ''}">${display}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const tableId = 'dtbl-' + Math.random().toString(36).slice(2, 8);

  // ── Deduplicar por RUC para causas penales ──
  let displayItems = items;
  let dupMap = {};   // ruc → lista de duplicados excluidos
  if (cols.includes('ruc') && cols.includes('fecha')) {
    const rucGroups = {};
    items.forEach(it => {
      const r = it.ruc || '__no_ruc__';
      (rucGroups[r] = rucGroups[r] || []).push(it);
    });
    displayItems = [];
    Object.values(rucGroups).forEach(group => {
      if (group.length === 1) { displayItems.push(group[0]); return; }
      // Ordenar por fecha DESC → el primero es el más reciente
      group.sort((a, b) => {
        const parse = s => { const [d,m,y] = (s||'').split('/'); return new Date(`${y}-${m}-${d}`); };
        return parse(b.fecha) - parse(a.fecha);
      });
      displayItems.push(group[0]);   // conservar el más reciente
      dupMap[group[0].ruc] = group.slice(1); // los demás como duplicados
    });
  }

  // ── thead con botones de orden ──
  const theadSortable = cols.map((k, ci) =>
    `<th class="sortable-hdr" data-col="${ci}" data-table="${tableId}" onclick="sortDetailTable('${tableId}',${ci},this)">
       ${COL_LABELS[k] || k}
     </th>`
  ).join('');

  // ── tbody con dedup + tooltip ──
  const tbodyDedup = displayItems.map(item => {
    if (typeof item !== 'object' || item === null)
      return `<tr><td colspan="${cols.length}">${formatVal(item)}</td></tr>`;

    const cells = cols.map(k => {
      const v       = item[k];
      const isEmpty = v === null || v === undefined || String(v).trim() === '';
      if (k === 'riesgo' && !isEmpty) {
        // Añadir badge de duplicados en la celda RUC si corresponde
        return `<td class="td-center">${riesgoCellContent(v)}</td>`;
      }
      let display = isEmpty ? '—' : formatVal(v);
      // Añadir badge de RUC duplicado
      if (k === 'ruc' && dupMap[v] && dupMap[v].length > 0) {
        const dups = dupMap[v];
        const tooltipRows = dups.map(d =>
          `<tr>
            <td>${d.crimen || d.delito || '—'}</td>
            <td>${d.estado || '—'}</td>
            <td>${d.fecha || '—'}</td>
            <td>${riesgoCellContent(d.riesgo)}</td>
           </tr>`
        ).join('');
        display += `
          <span class="ruc-dup-badge">+${dups.length} dup
            <div class="ruc-tooltip">
              <div style="font-weight:700;margin-bottom:6px;color:var(--danger)">
                Causas duplicadas bajo el mismo RUC
              </div>
              <table>
                <thead><tr><th>Delito</th><th>Estado</th><th>Fecha</th><th>Riesgo</th></tr></thead>
                <tbody>${tooltipRows}</tbody>
              </table>
            </div>
          </span>`;
      }
      const isHi = HIGHLIGHT_KEYS.has(k) || HIGHLIGHT_KEYS.has(k.toLowerCase());
      return `<td class="${isHi && !isEmpty ? 'td-highlight' : ''}">${display}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const dupCount = Object.values(dupMap).reduce((s, a) => s + a.length, 0);
  const dupNote  = dupCount > 0
    ? ` <span style="color:var(--warn);font-size:10px">(${dupCount} causa${dupCount>1?'s':''} duplicada${dupCount>1?'s':''} por RUC agrupada${dupCount>1?'s':''})</span>`
    : '';

  return `
    ${metaHtml}
    <div class="detail-count">
      ${displayItems.length} causa${displayItems.length !== 1 ? 's' : ''} encontrada${displayItems.length !== 1 ? 's' : ''}${dupNote}
    </div>
    <div class="detail-table-wrap">
      <table class="detail-table" id="${tableId}">
        <thead><tr>${theadSortable}</tr></thead>
        <tbody>${tbodyDedup}</tbody>
      </table>
    </div>`;
}

// ── SORT TABLA DETALLE ──────────────────────────────────
let _sortState = {};  // tableId → {col, dir}

function sortDetailTable(tableId, colIdx, thEl) {
  const tbl  = document.getElementById(tableId);
  if (!tbl) return;
  const prev  = _sortState[tableId] || {};
  const dir   = (prev.col === colIdx && prev.dir === 'asc') ? 'desc' : 'asc';
  _sortState[tableId] = { col: colIdx, dir };

  // Actualizar clases de header
  tbl.querySelectorAll('thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
  });
  thEl.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

  // Ordenar filas
  const tbody = tbl.querySelector('tbody');
  const rows  = [...tbody.querySelectorAll('tr')];
  rows.sort((a, b) => {
    const ta = a.cells[colIdx]?.textContent?.trim() || '';
    const tb = b.cells[colIdx]?.textContent?.trim() || '';
    // Intentar ordenar como fecha DD/MM/YYYY
    const parseDate = s => { const [d,m,y] = s.split('/'); return y ? new Date(`${y}-${m}-${d}`) : null; };
    const da = parseDate(ta), db = parseDate(tb);
    if (da && db) return dir === 'asc' ? da - db : db - da;
    // Numérico
    const na = parseFloat(ta), nb = parseFloat(tb);
    if (!isNaN(na) && !isNaN(nb)) return dir === 'asc' ? na - nb : nb - na;
    // Texto
    return dir === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
  });
  rows.forEach(r => tbody.appendChild(r));
}

function toggleDetail(el) {
  const detail  = el.parentElement.querySelector('.list-detail');
  const chevron = el.querySelector('.chevron');
  if (!detail) return;
  const open = detail.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open', open);
}

// ── RENDER RESULTADO INDIVIDUAL ───────────────────────
function renderResultado(data) {
  const listas = data.listas || {};
  let entries  = Object.entries(listas);
  const hitCount = entries.filter(([, e]) => e.coincidence).length;

  // Hits primero, luego sin coincidencia
  entries.sort((a, b) => (b[1].coincidence ? 1 : 0) - (a[1].coincidence ? 1 : 0));

  const hitsHtml = entries.map(([nombre, entry], idx) => {
    const hit    = entry.coincidence;
    const riesgo = (entry.risk || '').toLowerCase();
    const rCls   = {high:'risk-high', medium:'risk-medium', low:'risk-low'}[riesgo] || '';
    const dotCls = hit ? (riesgo === 'medium' ? 'dot-warn' : 'dot-red') : 'dot-green';

    const hasData = hit && entry.data !== null && entry.data !== undefined
                    && (!Array.isArray(entry.data) || entry.data.length > 0);

    const riskTag = hit
      ? `<span class="list-risk ${rCls}">${riesgo ? riesgo.toUpperCase() : 'DETECTADO'}</span>`
      : `<span style="font-size:11px;color:var(--muted)">Sin coincidencia</span>`;

    const chevron = hit ? `<span class="chevron">▼</span>` : '';
    const clickHandler = hit ? `onclick="toggleDetail(this)"` : '';

    return `
    <div class="list-item ${hit ? 'hit' : ''}">
      <div class="list-item-header" ${clickHandler}>
        <div class="dot ${dotCls}"></div>
        <span class="list-name">${nombre}</span>
        ${riskTag}
        ${chevron}
      </div>
      ${hit ? `
      <div class="list-detail">
        <div class="detail-entries">
          ${hasData
            ? renderDetailEntries(entry.data)
            : '<div class="detail-entry"><div class="detail-raw">Coincidencia registrada — sin detalle adicional disponible en la API</div></div>'}
        </div>
      </div>` : ''}
    </div>`;
  }).join('');

  const decision = data.decision || {};
  const decHtml  = decision.decision ? `
    <div class="section-title">Decisión (Motor local)</div>
    <div class="decision-box ${decisionClass(decision.decision)}">
      <div class="decision-label">${decision.decision}</div>
      <div class="decision-reason">${decision.razon || ''}</div>
      <div class="decision-stats">
        <span>Precedentes: <b>${decision.precedentes_count}</b></span>
        <span>No-precedentes: <b>${decision.noprecedentes_count}</b></span>
        <span>Equivalente total: <b>${decision.total_equivalente}</b></span>
      </div>
    </div>` : '';

  const pep = data.pep_level
    ? `<span class="badge badge-pep">PEP Nivel ${data.pep_level}</span>` : '';

  const banner = hitCount > 0
    ? `<div class="alert alert-err">
        ⚠ <strong>${hitCount} alerta${hitCount > 1 ? 's' : ''} detectada${hitCount > 1 ? 's' : ''}</strong>
        — haz clic en cada lista marcada para ver el detalle de la coincidencia
       </div>`
    : `<div class="alert alert-ok">
        ✓ <strong>Sin alertas</strong> — perfil limpio en todas las listas consultadas
       </div>`;

  // Guardar último perfil para PDF
  window._lastProfile = data;

  document.getElementById('result').innerHTML = `
    <div class="card">
      <div class="result-header">
        <div class="result-name">${data.nombre || data.razon_social || data.dni}</div>
        ${riskBadge(data.riesgo_final)}
        ${pep}
        <code style="margin-left:auto;font-size:13px;color:var(--muted);background:var(--surface2);
               padding:4px 12px;border-radius:6px;border:1px solid var(--border)">${data.dni}</code>
        <button class="btn btn-outline" style="margin-left:12px;padding:6px 16px;font-size:12px"
                onclick="pdfIndividual()">📄 PDF</button>
      </div>

      ${banner}

      <div class="section-title">Datos del perfil</div>
      <div class="field-grid">
        ${Object.entries(data.ficha || {}).map(([k, v]) => v ? `
          <div class="field-item">
            <div class="field-label">${k}</div>
            <div class="field-value">${v}</div>
          </div>` : '').join('')}
      </div>

      <div class="section-title">Resultados de listas — ${hitCount} alerta${hitCount !== 1 ? 's' : ''} de ${entries.length} consultadas</div>
      <div class="lists-grid">
        ${hitsHtml || '<div style="color:var(--muted);font-size:13px">Sin datos de listas disponibles</div>'}
      </div>

      ${decHtml}
    </div>`;
}

// ── MASIVO ────────────────────────────────────────────
let selectedFile = null;
let mStats = { high: 0, alerts: 0, ok: 0 };

function fileSelected(input) {
  if (input.files[0]) {
    selectedFile = input.files[0];
    document.getElementById('upload-label').textContent = '✓ ' + selectedFile.name;
    document.getElementById('btn-procesar').disabled = false;
  }
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.name.endsWith('.xlsx')) {
    selectedFile = f;
    document.getElementById('upload-label').textContent = '✓ ' + f.name;
    document.getElementById('btn-procesar').disabled = false;
  }
}

async function procesarMasivo() {
  if (!selectedFile) return;
  const btn = document.getElementById('btn-procesar');
  btn.disabled = true;
  document.getElementById('btn-spinner-masivo').style.display = 'block';
  document.getElementById('masivo-progress').style.display    = 'block';
  document.getElementById('masivo-stats').style.display       = 'none';
  document.getElementById('log-box').innerHTML = '';
  document.getElementById('prog-bar').style.width = '0%';
  document.getElementById('prog-text').textContent = 'Enviando archivo...';
  mStats = { high: 0, alerts: 0, ok: 0 };

  const form = new FormData();
  form.append('file', selectedFile);
  form.append('crear_fichas', document.getElementById('chk-crear-masivo').checked);
  form.append('delay',  document.getElementById('delay-input').value);
  form.append('limite', document.getElementById('limite-input').value);

  const uploadRes  = await fetch('/api/masivo/upload', { method: 'POST', body: form });
  const uploadData = await uploadRes.json();
  if (uploadData.error) {
    addLog('err', '✗ ' + uploadData.error);
    btn.disabled = false;
    document.getElementById('btn-spinner-masivo').style.display = 'none';
    return;
  }
  const jobId = uploadData.job_id;
  addLog('info', `Archivo recibido · ${uploadData.total} personas · job: ${jobId}`);
  if (uploadData.tiene_crimenes)
    addLog('info', 'Modo casos detectado — se aplicará motor de decisión local');

  const es = new EventSource(`/api/masivo/stream/${jobId}`);
  es.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'progress') {
      const pct = Math.round(msg.current / msg.total * 100);
      document.getElementById('prog-bar').style.width = pct + '%';
      document.getElementById('prog-text').textContent =
        `Procesando ${msg.current} / ${msg.total} — ${pct}%`;
      if (msg.error) {
        addLog('err', `[${msg.current}] ${msg.dni} — ✗ ${msg.error.slice(0,80)}`);
      } else {
        const r = (msg.riesgo || '').toLowerCase();
        if (r === 'high' || r === 'high risk') mStats.high++;
        if (msg.alertas > 0) mStats.alerts++; else mStats.ok++;
        const tag = msg.alertas > 0 ? ` · ⚠ ${msg.alertas} alerta(s)` : ' · ✓ limpio';
        addLog('ok', `[${msg.current}] ${msg.dni} — ${msg.riesgo || 'OK'}${tag}`);
      }
    } else if (msg.type === 'done') {
      es.close();
      document.getElementById('prog-bar').style.width = '100%';
      document.getElementById('prog-text').textContent =
        `✓ Completado — ${msg.total} personas procesadas · ${msg.errores} errores`;
      document.getElementById('btn-spinner-masivo').style.display = 'none';
      addLog('info', 'Descargando Excel de resultados...');

      document.getElementById('stat-total').textContent  = msg.total;
      document.getElementById('stat-high').textContent   = mStats.high;
      document.getElementById('stat-alerts').textContent = mStats.alerts;
      document.getElementById('stat-ok').textContent     = mStats.ok;
      document.getElementById('stat-err').textContent    = msg.errores;
      document.getElementById('masivo-stats').style.display = 'flex';

      // Descargar Excel
      window.location.href = `/api/masivo/download/${jobId}`;

      // Cargar carousel con los resultados completos
      fetch(`/api/masivo/results/${jobId}`)
        .then(r => r.json())
        .then(d => { if (d.results) initCarousel(d.results); })
        .catch(() => {});

      btn.disabled = false;
    } else if (msg.type === 'error') {
      es.close();
      addLog('err', '✗ ' + msg.message);
      btn.disabled = false;
      document.getElementById('btn-spinner-masivo').style.display = 'none';
    }
  };
  es.onerror = () => {
    es.close();
    addLog('err', 'Conexión perdida con el servidor');
    btn.disabled = false;
    document.getElementById('btn-spinner-masivo').style.display = 'none';
  };
}
function addLog(cls, text) {
  const box  = document.getElementById('log-box');
  const div  = document.createElement('div');
  div.className   = cls;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ══ PDF INDIVIDUAL ════════════════════════════════════
function pdfIndividual() {
  if (!window._lastProfile) return;
  _openPrintWindow(buildProfileHTML(window._lastProfile, true));
}

// ══ CAROUSEL ══════════════════════════════════════════
let _carouselData   = [];   // array de perfiles completos
let _carouselIdx    = 0;
let _carouselFilter = '';   // filtro activo
let _carouselVisible = [];  // índices visibles tras filtro

function initCarousel(results) {
  _carouselData    = results;
  _carouselFilter  = '';
  _carouselVisible = results.map((_, i) => i);
  _carouselIdx     = 0;
  document.getElementById('masivo-carousel').style.display = 'block';
  _renderCarouselCard();
}

function carouselFilter(q) {
  _carouselFilter = q.toLowerCase().trim();
  if (!_carouselFilter) {
    _carouselVisible = _carouselData.map((_, i) => i);
  } else {
    _carouselVisible = _carouselData.map((r, i) => {
      const dni    = (r.DNI || '').toLowerCase();
      const nombre = ((r.Nombre || '') + ' ' + (r['Apellido paterno'] || '')).toLowerCase();
      return (_carouselFilter && (dni.includes(_carouselFilter) || nombre.includes(_carouselFilter))) ? i : null;
    }).filter(i => i !== null);
  }
  _carouselIdx = 0;
  _renderCarouselCard();
}

function carouselPrev() {
  if (_carouselVisible.length === 0) return;
  _carouselIdx = (_carouselIdx - 1 + _carouselVisible.length) % _carouselVisible.length;
  _renderCarouselCard();
}
function carouselNext() {
  if (_carouselVisible.length === 0) return;
  _carouselIdx = (_carouselIdx + 1) % _carouselVisible.length;
  _renderCarouselCard();
}

function _renderCarouselCard() {
  const pos   = document.getElementById('carousel-pos');
  const card  = document.getElementById('carousel-card');
  if (_carouselVisible.length === 0) {
    pos.textContent = '0 / 0';
    card.innerHTML  = '<div class="alert alert-info">Sin resultados para el filtro actual</div>';
    return;
  }
  pos.textContent = `${_carouselIdx + 1} / ${_carouselVisible.length}`;
  const realIdx = _carouselVisible[_carouselIdx];
  const r       = _carouselData[realIdx];
  card.innerHTML = `<div class="carousel-card-inner">${buildCarouselCard(r)}</div>`;
  card.querySelectorAll('.list-item-header[onclick]').forEach(el => {
    el.onclick = () => toggleDetail(el);
  });
}

function buildCarouselCard(r) {
  const nombre   = [r.Nombre, r['Apellido paterno']].filter(Boolean).join(' ') || r['Razón Social'] || r.DNI;
  const riesgo   = r['Riesgo final Ficha'] || '';
  const causasOk = r['Coincidencia_Causas penales Chile'];
  const pepOk    = r['Coincidencia_PEP Chile'];
  const errMsg   = r.regcheq_error ? `<div class="alert alert-err">⚠ ${r.regcheq_error}</div>` : '';

  // Badges de coincidencias
  const LISTAS_LABEL = {
    'Coincidencia_Causas penales Chile':      '⚖ Causas Penales',
    'Coincidencia_PEP Chile':                 '🏛 PEP Chile',
    'Coincidencia_Funcionarios Públicos Chile':'🏢 Func. Público',
    'Coincidencia_PDI':                       '🔍 PDI',
    'Coincidencia_Países Sancionados (GAFI)': '🌐 GAFI',
    'Coincidencia_Organismos internacionales':'🌍 Org. Int.',
    'Coincidencia_OFAC Domicilio':            '🏠 OFAC Domicilio',
    'Coincidencia_Screening Global':          '🔎 Screening Global',
    'Coincidencia_RTP':                       '⚠ RTP',
    'Coincidencia_BIC':                       '📋 BIC',
    'Coincidencia_Palabras Clave':            '🔑 Keywords',
    'Coincidencia_Comentarios de Riesgo':     '💬 Comentarios Riesgo',
    'Coincidencia_Lista de interés':          '⭐ Lista Interés',
    'Coincidencia_Lista Regcheq':             '📌 Lista Regcheq',
  };
  const hitBadges = Object.entries(LISTAS_LABEL)
    .filter(([k]) => r[k] === true || r[k] === 'True' || r[k] === true)
    .map(([k, lbl]) => {
      const isCausa = k.includes('Causas');
      return `<span class="badge ${isCausa ? 'badge-high' : 'badge-medium'}" style="font-size:11px">${lbl}</span>`;
    }).join('');

  // Tabla de causas penales si hay datos
  let causasHtml = '';
  if (r.causas_penales_data) {
    try {
      const casos = JSON.parse(r.causas_penales_data);
      if (casos.length > 0) {
        causasHtml = `
          <div class="section-title" style="margin-top:16px">⚖ Causas Penales Chile</div>
          ${renderDetailEntries({ additionalData: casos, info: { name: r.causas_penales_imputado } })}`;
      }
    } catch(e) {}
  }

  return `
    <div style="border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:16px">
      <div class="result-header" style="flex-wrap:wrap;gap:8px">
        <div class="result-name">${nombre}</div>
        ${riskBadge(riesgo)}
        <code style="font-size:12px;color:var(--muted);background:var(--surface2);
               padding:3px 10px;border-radius:6px;border:1px solid var(--border)">${r.DNI}</code>
      </div>
      ${errMsg}
      ${hitBadges ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${hitBadges}</div>` : ''}
    </div>
    <div class="field-grid" style="margin-bottom:12px">
      ${r.Nombre ? `<div class="field-item"><div class="field-label">Nombre</div><div class="field-value">${r.Nombre}</div></div>` : ''}
      ${r['Apellido paterno'] ? `<div class="field-item"><div class="field-label">Apellido</div><div class="field-value">${r['Apellido paterno']}</div></div>` : ''}
      ${r['Tipo de persona'] ? `<div class="field-item"><div class="field-label">Tipo</div><div class="field-value">${r['Tipo de persona']}</div></div>` : ''}
      ${r['listas_total_coincidencias'] ? `<div class="field-item"><div class="field-label">Total alertas</div><div class="field-value">${r['listas_total_coincidencias']}</div></div>` : ''}
    </div>
    ${causasHtml}`;
}

function carouselPDF() {
  const realIdx = _carouselVisible[_carouselIdx];
  if (realIdx === undefined) return;
  const r = _carouselData[realIdx];
  _openPrintWindow(buildCarouselPrintHTML([r]));
}
function carouselPDFAll() {
  const fichas = _carouselVisible.map(i => _carouselData[i]);
  _openPrintWindow(buildCarouselPrintHTML(fichas));
}

const LOGO_B64 = 'data:image/jpeg;base64,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6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAQEBAQEBAgEBAgMCAgIDBAMDAwMEBgQEBAQEBgcGBgYGBgYHBwcHBwcHBwgICAgICAkJCQkJCwsLCwsLCwsLC//bAEMBAgICAwMDBQMDBQsIBggLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLC//dAAQAK//aAAwDAQACEQMRAD8A/v4ooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9D+/iiiigAooooAKKKKACiiigAopCQo3NwBXzl8W/2wP2V/gR5sfxg+Ifh/w/PENzW13fwrckf7MAYyt+Cmt8Phq1efs6EHKXZJt/ciZTjFXk7I+jqK/HvxR/wXg/4JmeG5JIbTxxc6s8fBFlpV6QT7NJDGp+oOK4m3/wCDg3/gnBNOsUmsa3EpOC76VLtHudpJ/IV78OC8+kuZYCrb/BL/ACOV5jhVp7WP3o/bqivy9+H/APwWc/4JqfEa8j07S/ifZafcSEDbqttc6egJ9ZbiJIh/33xX6EeBPij8NPijpK698M/EWmeIrFuBcaZdxXcRPX70TMP1rysbk+Pwf+94edP/ABRlH80janiKVT+HNP0dzuqKKK842CiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9H+/iiiigAooooAKKK83+Lnxc+HXwJ+Hep/FX4rapDo2haPEZrm6nOAo6AAdWZjgKoBLEgAZq6VKdSap003JuyS1bb6ITaSu9j0OeeC1he5uXWOOMFmdjhVA6kk9AK/Bz9uP/gvd+zZ+zbNd+A/gXEvxH8WQ7o3e2l2aVayf9NLgZMrA9UhBB5BdTX4Af8ABS3/AILO/GD9svVLz4afCV7jwh8No2aNbaN9t7qS9N926nhD1EKnaM/MXOCPxGr+g+D/AAdhyxxWe7vVU07W/wAbX5Rfq+h8nmHELu4YX7/8j9KP2lv+Ctf7c/7T9xcW3ivxlc6HpE5YDS9DJsbYI3G0lD5jjHHzu1fm5NPNcytcXDtJI5JZmOSSe5JqKiv3TAZZhMDTVHB0owj2ikvy3PmatapVfNUk2/MKKKK7jIK7LwP8RPH3wy1yLxN8OtbvtC1GE5S5sLh7eUH/AHoyprjaKmcIzi4zV0+jGm07o/e/9lH/AIOCv2uvgpdWuh/G5IPiPoCELJ9qxb6iiDjKXCDDHv8AvEbPTIzmv6x/2N/+CjP7LX7cWhLd/BvXRHrMce+60PUAINRt/XMeSJFH9+JnTnkg8V/mk103g7xn4t+HviW08Y+BdSudI1WwkEttd2crQzROvQq6kEGvzHifwqynM4yqYWPsK3eK91/4o7fNWfqe1gs8r0WlN80fPf5M/wBXqiv5pf8AglR/wXJ0v423Gn/s9/thXUGm+LZNsGm6+QsNrqTdFjnAwsU57MMJJ0+VsBv6WgQRkV/Mef8ADuOybFPCY6FpdH0ku8X1X4rZpM+0wuLpYiHtKT0/L1CiiivDOkKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//0v7+KKKKACiiigDnPGHi7w14A8Kal448ZXkWnaTpFtLeXl1MwWOGCFSzuxPQAAmv8+P/AIKpf8FM/HH7e/xWfSdCnm0/4caBO66NpoJTz2+6bu4H8Urj7gPEaHC8ly36nf8ABw7+3/e6jrcf7CvwzvTHZWghvfFEkTf62U4kgtGx/Cg2yuO7FP7pr+VCv6Y8JeB4YbDxzrGxvVmv3af2Yv7XrLp2j6s+Mz7M3OTw1N+6t/N9vl+YUUUV+4HzQUUUUAFFFFABRRRQAUUUUAOR2jYOhKspyCOCCK/sy/4Ief8ABWGf4vWNj+xz+0ZqBk8UWUXl+HtWuHy2oQRj/j2lY8meNR8jf8tFGD8wy38ZdbnhnxLr3gzxFY+LfC13JYalpk8dza3ELFZIpomDKykdCCAa+Y4s4Xwue4CWErq0lrCXWMu/o+q6rzsztwGOnhaqqR26ruj/AFhKK/O7/gmJ+2/pH7dv7LumfEmcxw+J9KP9m+ILROPLvYlB8xR18uZSJE7AkrklTX6I1/FeY4CvgcTUwmJjacG015r9Hun1R+j0qsakFUg9GFFFFcRoFFFFABRRRQAUVzfi7xl4Q8AeH7nxZ461S00XS7NC895fTJbwRKO7SSEKo+pr8ZPjp/wcBfsB/CS/m0Twdfan48vYSyMdGtttqHXt59wYlYHs0QkX3r1sryHMcyk44HDyqW3snZer2XzZhXxVGir1ZpH7f0V/KBrv/Bz5pS3TL4a+EcrQgnabnVQGI7cLAQPzNWvDf/Bz34dku1Txd8JbiKAkbntNUVmA7/K8IB/MV9V/xC7ifl5vqn/k8L/+lHD/AG3gr29p+D/yP6taK/Gb4Af8F4f+Cfnxw1GDQNa1y78C6jOwRE8RQCC3LH/p5jaSFB7ytHX7DaNrejeI9Lg1zw9dw39ldIssNxbyLLFIjDKsrqSrAjkEEgivk8zyTH5dP2eOoSpt7cyav6PZ/JnfRxNKsr0pJ+hp0UUV5ZsFFfyt/wDByz468beC0+E58H6xfaT551XzfsdxJBv2/Z8btjDOMnGa/L3/AIIgfFb4oeJ/+ClHgPRvEniTVdQs5YdVLwXN5NLE22wnIyrsQcEZHHWv03LvDapi+H5Z8sSklCcuXl19zm0vfry9jxq2cKni1heTqle/e3+Z/fNRRRX5keyFFFFABRRRQAUUUUAFFFFABRX+Xr8W/jf8aLb4reJ7e38X62kcerXqqq6hOAAJnAAAfgCv7of+CIGv674m/wCCcHgnWPEl7PqF3LPqYee5kaWRsXcoGWYknA4HNfpnF/hxUyLL6ePliVNSko2Ubbpu97vseNgM3WKrOkoWsr7n600UUV+ZnshRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRX+cH/wAFFfjF8XNG/bo+Kul6R4q1i1toPEd6kUMN9MkaKH4CqrgAD0Ar+mv/AINwvFvirxj+x74x1Hxdqd3qtxH4xnjWW8med1QWVmdoZySBkk46c1+m8QeG1TK8mhm8sSpKXJ7vLb4/O729DxsJnCr4h4dQta+t+x/QjRRRX5keyFFFfEv7Uf8AwUU/Y9/Y8jNt8b/GVraart3JpNmDeag+RkZgiDMgPZpNie9dWDwOIxdVUMLTlOb2UU2/uRFSrCnHmm7LzPtqiv5hfiN/wc2/BXTLxrf4V/DbV9XhGcTajdRWRPp8kYn/APQq8mtf+Dn6T7QPtvwhBizzs1b5sfjBivtKXhhxNUjzLBtesoJ/c5XPOlnWCTt7T8H/AJH9adFfzv8Awg/4ORf2O/GNzBp/xY8P674NklOHuBGmoWsfuzQkTY/3YWr9xfgx8efg1+0T4Oi8f/BDxLYeJtIkIXz7GUSeW5Gdki8PG4B5R1Vh3FfPZvwzmuV64/DSgu7Xu/8AgSuvxOqhjaFf+FNP8/uPW6KKK8I6goprMqKXcgAcknoK/Lv9p7/gsX+wf+yzqNx4a8S+K/8AhI9etiVk0zw8gv5Y3U4KySBlgjYHqjyhx6V35dleMx9X2OCoyqS7RTf322XmzKrXp0o81SSS8z9RqK/lc8Y/8HO/ge3vnh8A/Cq9u7cH5Zb7UUhdh7pHFIB/30a5zR/+Dn2yNyo1/wCETiE9Tb6sNw/76gxX2MfC7iZx5vqn/k0L/dzHnvO8Fe3tPwf+R/WNRX4YfAv/AIODf2DPivqMGheOZtV8B3k5VRJq1uJLPe3bz7cybQO7SIijua/a7wp4u8K+O/D1r4u8Eana6xpV8gltryxmS4t5kPRkkjLKw9wTXy2a5DmOWSUcfQlTvtdaP0ez+TO6hiqNZXpSTOhoooryDcKKKKACiiigD//T/v4ooooAK+ev2r/2gNA/Za/Z18XfHvxGFeLw5p8txDCx2ie5I2wRZ7eZKVTPbOa+ha/mV/4OWvjtceGPgf4I/Z/0yXY/ijUZdSu1VuTb6eoCgj0MkoIz/d9q+j4Syb+1c3w2Bfwyl73+Fay/BM5MfiPYYedXqlp69D+Pfx/468UfE/xxq/xG8bXTX2sa7eTX15cP1knnYu7e2SeB0A4rkaKK/uOEIwioRVktEj8zbbd2FFaGk6Tquvapb6JodtLe3t3IsMFvAhkllkc4VURQWZiTgADJNfpj8Pf+CM//AAUi+JegxeI9D+G1zZ28yhkXU7m3sJSp5z5c8iuPoQDXFjs1wWCSljK8Kae3NJRv97NKVCpVdqcW/RH5fUV9zfH3/gmv+29+zPpEniT4ufD7UbTSoQWlv7ULe20QHJLyQFwgHq2BXwzWmDx+GxdP2uFqxnHvFpr70KpSnTfLOLT8wooorrMwoora8OeG/EPjDXLXwx4TsLjVNSvXEVva2kTTTSueioiAsx9gKUpKKbb0BK+iMWiv1Q8Gf8EVv+ClPjnRI9e0z4cS2cUwDKmoXltZy4PcxyyBh9CAa+e/2hf+Ce/7ZH7LVg+t/GzwHqOl6XHgPqEarc2a5IA3TQl0XJIA3EZNePQ4iyqvV+r0cXTlP+VTi3917nTLB14x55U2l3sz4zooor2TmP2o/wCCFH7Wc/7Of7aem+AdbujF4d+IuzRbpSTsW8Y/6I+PXzD5YPYSHtX9/Ff5NumanqGi6lb6xpMz291aSpNDLGdrxyRkMrKR0IIBBr/UO/ZP+Nlv+0d+zV4H+OMGzf4l0a1vLhYzlY7lkAnQY/uSh1/Cv5t8bsjjSxNDNaa/iLkl6x1i/mrr/t0+x4bxLlCVB9NV6Pf+vM+hKKKK/CT6cKKKKACvzR/4KOf8FNPhB/wT58ApNrKDXfGmqxt/ZGhQuFZ8cedO3PlQKe+CznhQfmK/T37W37THgn9kP9n/AMRfHvx3+8ttEty0FsG2vdXT/LDApwcGRyBnB2jLHgGv81j9oT4/fEv9p34va18a/izem91nW52mkxkRQp/BFEpJ2xxrhUXJwByScmv1Lw14DWeV5YrGJ/Vqbs+nPLflv0S3k99UlvdeJnGafVoqFP43+C7/AOR6j+1j+3J+0j+2h4uk8T/G/wAQTXdsshe10uFjFYWgPQRQg7cgcbmy57k1wnwM/ZX/AGif2ltW/sf4F+D9T8SyKwV5LSAmGMn/AJ6SnEaD3ZhX7df8Eif+CLY/aX0+z/aT/akimtfA7Nv0vR1Jim1Xaf8AWSMMNHb5GBtw8nYqoy39nHgX4f8Agf4Y+Gbbwb8O9ItNE0qzQJBaWUKwQoo9FQAV+ncT+JuX5C/7LyehGc4aO2kIvtp8T72t63ul4uCyWriv3+Ik0n97/wAj+FvwZ/wbx/8ABRTxRYR3ms2vh3w679YdR1PfIv1+yx3C/kxpPGn/AAbyf8FFPCthJe6NaeHvETp/yx07U9sjfT7VHbr+tf3qUV+c/wDEZ+IOfmtTt25Xb/0q/wCJ6/8Aq7hLW1+//gH+Wt8b/wBmH9oP9m7WP7C+OfhDU/DM5YqjXsDJFJjvHJyjj3ViDX0n+w5/wUt/aT/YU8U28/w/1J9T8MPKGvfD167PZzoT82wdYZCOjpjnGQw4P+i78Rfhn8Pfi54UuvA3xP0az17SL1Ck1pfQrNEwPswOD6EcjtX84HjL/g2/+Fuo/tW6d4s8H6/JYfCeZmu9R0Z2Z76ORCCLWCU9YZM43uTIigjLEgj7jLPFbJ82wlTCcQUFHRvbmjKy2XWMu3/pSZ5tbI8RQqKphJX/AAa/zX9WP3k/ZJ/ai+H37Y3wJ0b48fDZJ4LDVVZZLe5TbLbzxnbJG3ZtrcBlyGHIr6UrlfA/gfwj8NfCWn+A/AWnwaVo+lQrb2lpbqEjijQYAAH/AOs966qv52xkqEq9SWGi4023ypu7Svom+rsfW01JRSm7vqfyZf8ABz9/q/hD9dX/APbevyo/4IS/8pOvAH/XDV//AE33Ffqv/wAHP3+r+EP11f8A9t6/Kj/ghL/yk68Af9cNX/8ATfcV/TfDf/Ju6n/Xqv8AnM+Nxn/I3j/ij+h/oSUUUV/LZ9qFFFeK/GX9o/4Dfs9aUus/G3xbpfhmB1LRi/uFikkA67I873/4CprWjQqVpqnSi5SeySu38kTKSirydke1UV+PHiD/AILwf8E1PD961l/wmd1e7TjfaaZdSJ+B8sZroPA//Bb/AP4Js+Ob9NOg8enTHkbaG1KyuLZM+7NHtH4mvdlwhnkYc7wNW3+CX+RzLH4a9vax+9H6z0VxPgH4k/D34q+Ho/Fnwz1yx1/TJeFutPuEuIifTchIBHcHkV21eBOnKEnCas1unudSaaugoooqBn+VL8Yf+St+Kf8AsL33/o56/vb/AOCEv/KM7wN/18ap/wClktfwSfGH/krfin/sL33/AKOev72/+CEv/KM7wN/18ap/6WS1/UPjH/yTmH/6+Q/9ImfFcPf75P0f5o/X+ivlL4+/txfsnfswlrf43eOtL0W8UZ+xNL5t3g9P3Ee6QZ7EqBXwjdf8F9P+Cadtctbf8JXqMm043ppN0VPuDs6V/POD4azbFw9rhcJUnHuoSa++x9ZUxlCm+WdRJ+qP2bor87Pg/wD8FX/+Cf3xv1CPR/B3xJ023vZiAlvqe/T3YnsDOqKT7Zr9DoZ4bmFLi2dZI5AGVlOQQehBHUVw43LcXg5+zxdGVOXaUWvzNadanUV6ck15MloooriNAoorwb4xftR/s6fs+25n+NPjXSPDZ27xFe3SJMy+qxZMjfgprahh6taap0YOUn0Sbf3ImUoxV5OyPeaK/H7xH/wXZ/4JqeHLs2h8bXF8QSN9nptzKnHv5YqHQP8AgvB/wTU1+8Fl/wAJndWW4433WmXUafn5Zr3f9T895ef6jVt/gl/kcv8AaGFvb2sfvR+w9FeJ/Bj9pD4C/tEaS2t/BHxbpniaBFDSCxuFkkjDdN8ed6Z/2lFe2V4NahUozdOrFxkt01Zr5M6oyUleLugooorIo/zPP+Ck/wDyfv8AFr/sZb7/ANDr+pL/AINn/wDkzHxn/wBjpcf+kNnX8tv/AAUn/wCT9/i1/wBjLff+h1/Ul/wbP/8AJmPjP/sdLj/0hs6/qTxE/wCSKo+lH8kfE5T/AMjKX/bx/RjRRX5F/wDBZ79tm4/Y3/ZIuo/B119n8Y+NnfSNHKnEkKlc3FyO/wC6jICntI6V/NmUZXXzHGUsDh1ec2kv1b8ktX5I+wxFaNGnKrPZH5i/8Fff+C2Or+CvEOp/stfsd6gIr+zLW2ueJISCYZej29oeRuXpJL/C2VXkFq/k6s7Lxz8UvGAtrGK98Q69q85O1Q91dXM0h5P8TuxPU8k0/wAFeDvF/wAVPHWm+BfB9rJqeua9eR2lrAvLzXE7BVGT6seSeB1Nf6FH/BNX/gmH8J/2C/htaXVzbW+sfEPUIFbV9bZNxV2GWgtiwykKHjIw0hG5uyr/AE7j8dlHAWWQoUKfPXn8pTa3lJ9Irovkluz4ulSxGaVnKTtFfcvJeZ/KL8F/+CCf/BQ/4waXDrepaHpvgy1nUOh8Q3nkSlSM8wwJPMh9nRTX0hef8G0P7aMVmJbHxl4MmnwS0bXN6gB9m+xnP4gV/blRX5TiPGXiCdRyp8kV2Ub/AIttnux4ewiVnd/M/wA5j9ov/gj7+3x+zPpc/iTxf4MfWdGtgWk1DQpRqESKASWdExMigDlnjUe9f1hf8EL/ANj1v2Yf2OrXxr4ltvI8TfEVo9Xvdww8dqFItIjnptRi5H96Q+1ftIQGBVhkHqKRESNBHGAqqMADgACvO4k8TMxzrLVl+JhGPvJycbrmS2TTb6677paG2Dyajhq3tYNvTS/QdWP4h8QaH4T0G98UeJruKw07ToJLm6uZ3CRQwxKWd3Y4AVQCST0FbFfywf8ABxj+27qfhjQNJ/Yr8AXpgk1qJdT8RtE2GNqG/wBHtyR0Dupkcdwq9ic/McL8P1s6zKlgKLtzbv8Alit3923d2R2Y3Fxw1GVWXT8z88P+Co//AAWm+Jv7UHiTUvg/+zpqFx4c+G9uz27TwEw3ergcF5GGGSFv4Yhgkcvknav4u/Cb4LfFr48+LIvBHwe8PX/iTVpzxb2MLTMAf4mIGFUd2YgDua9b/Yu/ZN8e/tqftB6L8B/AOYnviZ768KlksrKIjzZ39lBAUZG52Vepr/RZ/ZT/AGQ/gd+xt8L7T4XfBTSI7KCJF+1XjKGu72YD5pZ5MZdmPbhVHCgAAV/RfEHE2V8E4SnluXUVKq1e3/t03u2+i6+SsfI4TBV8yqOtWlaP9aI/ja+G/wDwbs/8FBPG+mx6l4nbw34S3jJg1TUHknA+lpDcJn2Lj35rv/EP/BtX+27pts9xoPijwdqTIMiIXd3C7H0G6z2/mwr+4KivymfjHxFKfMnBLsoafi2/xPdXD2EStr95/ms/Gb/gmB+3N8BvFmneEviB4Avg+sXkNhZXdntvLOae4cRxKJ4SyKXYjAcq3qBX+gJ+xf8Asz+H/wBkH9mfwn8AdBZZm0SzUXtwowLm9l+e4l55w8hbaD0XA7V9PyRRSgLKoYAg4IzyOlPryOLfELHcQYajhsTCMFBtvlvaT2Ts72sr9XudGAymlhZynBt379Aooor4E9QKKKKACiiigD//1P7+KKKKACv4Rv8Ag4r+Ij+Lv2/o/ByPmLwp4dsLMoDkCW4Ml0xx2JWZB9AK/u5r/Os/4LWalJqn/BTv4pzyMW8u506EZ7CLT7ZMfpX694K4dVM+qVH9ilJr1cor8mzwOI52wqXeS/Jn5ZVd03TtQ1jUbfSNJge5u7uRIYYYxueSSQhVVR3LEgAetUq/SX/gkH4I8OfEH/go98LPD3ipQ1ompS3oDHCmWxt5bmIH6yRqMdycV/TmZ41YPB1sW1dU4ylbvypv9D4uhS9pUjT7tL7z+tb/AIJlf8Ez/gx/wTw+C/8Awub4xixk8ezWBvtb1u/ZBBpEATe8EDv8sUca582XILkEk7Aqj5a+Of8Awcnfs5eB/Fk/h34LeEdT8Z2duxU6lJKthby47xK6tKVPYsqH2qD/AIOTf2gtd8C/s/eEPgJ4euWt18bX81zqAQ48y004Iwjb/ZMsiN7lfav4sK/EODeDKXElKWf8QSlUlVb5Y3aSSdulnumkk0kl1vp9NmOYywclhcKklHdn+gD+xF/wWz/ZX/bS8VQ/CTWbS58F+KdQ/d2thqrJJbXrHP7uGdflLkDhHVS2cLuPFfkT/wAFz/8AglJ4H+D+iTftkfs26XHpGjNcIniPR7VQltbPOwRLqBBgRozkJJGvyhmBUDLV/MDpupaho+owavpM7211ayLNDNExV45EO5WUjkEEAgjoa/0gfgzrH/Ddv/BMTSbrx/tlufiB4Je11FyvH2yS3aGWRQOmJlLrjpgVjn+TrgnMsLmuVzksPUlyVIN3Vt/npdq92mt2nYrCYj+0qM6FdLnSumf5uNFQW032m2juACvmKGweoyM1PX9Bs+SOh8I+E/EXjzxXpngfwfaPf6trN3DY2VtF9+a4uHEcaL2yzMBzxzX+gf8AsFfsBfs8/wDBL34AXHxH+I8+nJ4pjsPtXibxReFQluigM8MMj8x26HA4wZGAZhnAH8tH/BBP4b6Z8Qf+CjfhvUNWiWWPw3p9/q0asMjzo4/KQ46cGXI9CAa/Wb/g5l+OvirRfBvw/wD2ddGuHt9L12S41jU0RiouPshRLdGwfmRXZn2kEbwjdVFfi/H9fFZvneE4Ww9RwpzXPUa6rV287KN0tm2r7H0mVRp4fDVMdNXa0X9fP7j0D4u/8HLnwC8MeLJ9E+EXgXVfFGnW7lRqNxOlikwBI3RxlXfaRyN4U88gV9yfsQ/8Fgf2UP2+dUPwimtZfDXim+icLomsiOSK9QA71hkGUlIXJaNgrFckAgHH+e5W54Y8TeIfBfiOw8YeEryXTtV0q4ju7O6gYpLDPCwdHRhyGVgCDXoY7weyKeFdLCqUKqWk+ZvXpdPS3eyXlYxpcQ4lVOadnHtY/oa/4Lkf8EsfC37MV7F+1P8As9aeun+C9Zuxb6rpcC4h0y8nyUeIDhLeU/KE4WNyFXCsqr/OTX+i18avFHh/9sj/AIJBa78RPF8VvGni74cNrcyM4EVtfrZi6GW5A8i5QfQpX+dLXX4W55i8dl1XC49t1cPPkbera6XfVrVX6pLqZ55hadKtGdL4ZK4V/e3/AMG+HxEn8af8E9bDw5ctlvDGs3+np7RuwuB+spr+CSv7Tf8Ag2a1B5v2Y/H2mtnEHiRGHp89un+FYeMWHVTh2U3vCcGvxj+pXD02sWl3T/zP6U6KKK/ks+8CiiigD+Q//g5h/aLvpvFPgX9ljSJ2W2t7VvEWpIrfK7ys8FspA5yoSVsH+8DX4c/8E3P2TZ/20P2v/CvwWug40YytqOtSJn5NOs8PKMjoZDthU9mkBr33/guJ4su/FX/BTb4jLOxMWmf2bYQKf4UisYCwHsZGdvxr9NP+DYnwNpl38Q/in8SLhAbux0/T9OgbusdzJJJIPxMSflX9X4eq8g4DjiMPpP2Skn/eq21+Tl+B8LOP1rNHGe3Nb5R/4Y/rv0HQtG8L6JZ+G/DtrHZWFhClvbW8KhY4oowFVVA4AUAACtaiiv5Rbbd3ufdBRRRSAKKKzG1rRlJVruEEcEGRf8aaTewGnRUMFxBdRia2dZEPRlII/MVNSA/ky/4Ofv8AV/CH66v/AO29flR/wQl/5SdeAP8Arhq//pvuK/Vf/g5+/wBX8Ifrq/8A7b1+VH/BCX/lJ14A/wCuGr/+m+4r+pOG/wDk3dT/AK9V/wA5nxWM/wCRvH/FH9D/AEJKKK/NT/grF+2Tc/sU/sda38QPDUgTxRrTro2hZGdl3chi0xHPEMSvIMjBcKp61/NOW5fWx2LpYPDq85tRXz7+S3fkfYVqsaVOVSey1Pzb/wCCs/8AwW3P7POtX/7OH7Js1veeMLfdDqutsqzQaY/QxQqcrJcL/EWBSM8YZshf45vG3j34ifF7xfceLfiBq194i1zUpd0tzeSvc3ErtwBliWPoAOnQVjWtr4j8c+J47O1WbU9W1e5CKOZJp7idsD3ZnY/Uk1/fN/wS3/4JLfCn9i/wHpfxE+IunW+t/FC+gWe7vZ1WVNNZxnyLUEEKUB2vKPmY5wQvFf1BXqZLwDlkOWnz156dOabW7b+zBdummjd2fFRWJzWs7u0V9y/zZ/H78Of+CVf/AAUM+KumJrHhL4Ua2ttIoZHv0TTtynoVF28RIPYgGuC+NH/BPn9tX9nrTJtd+Lvw21vS9OtxumvVg+02kY9XngMkaj/eYV/ptUyWKKeNoZlDo4KsrDIIPUEV8BDxxzJVbzwtNw7JyT/8Cu1/5Keq+GqPLZTd/l+X/BP8uP8AZ2/al+Pf7KfjiH4g/AfxLd6DfRsDJHE+62uFH8E8LZjlQ88Mpx1GDzX92P8AwS4/4KoeBv8AgoF4Qm8N6/DBoXxD0WBZNR0xG/dXEXCm4tgxLGPcQGUkmMkAkggn8xP+C2H/AASI8AW3w/1X9sH9mDR49HvdIU3XiLR7JNltPbD791DEoxG8f3pFUBWXLYBBLfy3/s8/Hbx7+zP8aPD3xx+Gl01pq/h+7S4jIJCyx9JInAIzHKhZHHdWNfdY/LMo46yh47Bx5MRHRN/EpL7M7bxfR9L3XVHmUq1fLMR7Oo7wf3W7rzP9TmivKPgX8XfDXx8+Dvhr4zeEG3ad4l0+C/hBOSnmqCUOO6NlT7ivV6/lqrSnSnKnUVpJtNdmtz7eMk0mtj/Kl+MP/JW/FP8A2F77/wBHPX6w+GP+CunxE+An/BPnwj+yD+zdLJo+vgX761roGJrdLm5ldYbXP3XKMC0vVc4XDfMPye+MP/JW/FP/AGF77/0c9fan/BMj9gXxH+3/APtCR+AfMlsPC2ixrfa/qEY5it92FiQnjzZmyqA9AGbBCkV/bud4fLJZfTxObJOjRtU12uotK6676Lq7bn5rhp1lWcKHxS0/E+QvAnwx+OX7R/jOfT/h3oes+NdeuWM9wLOGW+uGLnJklZQxGScl3OM9TX2v/wAOcP8Agpb/AGP/AG5/wqnUfJ27tn2i087H/XLz/Mz7bc1/oCfAf9nn4NfszeALX4Z/BDQLTQNJtgMpboA8zgY8yaT78sh7u5J98V7RX4pmPjhi/atZfhYKmtue7bX/AG64pemtu59JS4ap8v72bv5f8E/yrPil8GPi78DvEA8LfGHwzqfhfUSN6QanayWruo/iQSAbl/2lyPev0W/4J8f8Fcv2iv2H9ftfDuoX1x4r+H7uoudCvZS/kJ3azkfJhYddg/dt3XOGH97Hx2/Z9+Dv7S/w/uvhj8bdBtde0i6B/d3CAvE5GBJE/wB6OQZ4dCCK/wA+L/gpz+wB4m/4J/ftAP4H8yTUPCeuI974f1Fx80tuGw8MhHHnQkgPjqpVuN2B9pw1xrlfF9OeVZnh0qjV+V6qVt3F6NSW9t0tU3rbzsZl1fL2q9Genft6+R/oO/s//Hz4Y/tN/CXSPjT8IdQXUdE1mLzI36SRuOHilXkpJG3ysp6H1GDXstfxDf8ABvL+2Tqfwq/aPl/ZX8U3h/4R3x8sj2KO3yQarAhdcZOB58ashxyzhBX9vNfgXG3DEsizSeDvem/eg31i9r+aaafpfqfU5bjViqCqddn6n8xf/Bd//goX+2H+zD4r0r4G/Bxf+ET8P+JNNNyviS2Ja9uWDFJoIpCMW7R/KWKZkwykMucV/IZaWfxK+MfjL7LYxan4q8Q6pKW2oJb68uJG5JwN8jse/U1/pE/t2/sI/Cn9vn4Y6d8NfidNNY/2XqMN/bXtoF+0RhTiVFLAgCWMlT1wcHBxXp/7OH7JH7PH7JnhGPwd8BvC9nocIQLNcIge7uSOd007ZkkOf7zYHQADiv0DhjxJyvI8lp0cPhL4rVSton2lKWrd10XZ7Kx5WNyevicS5Tqe50/yS/r5n8Cvgr/gkB/wUj8e6cNU0b4U6pbQkZA1B4LCT/v3cyxv/wCO1wnxh/4Jlft5/AfSJvEPxK+GOsW+nW6GSa6tES/hiReS0j2rShFHctgV/paUEZ4NKHjjmqqXnhqbh2XMn9/M1/5KD4aoctlN3+X+R/lOfDX4o/Eb4OeMLPx/8K9bvPD+tafIJILuxmaGVSO2VIyp6MpyGHBBFf3lf8Ef/wDgp7F+3p8ObzwV8SzDa/EfwtCj36RARpf2rHaLuNB93DYWVQNqsykYDAD8dv8Ag4V/YF8AfCK90b9rr4RaZDpFr4ivjp2u2tsgjgN66NJFOqKNqmUI4kxgFgG+8xJ/Jz/gkx8atU+Bf/BQD4c+JbGYxW2qaimjXqhtqyW2o/uWDdiFZlcA/wASg9q/QM/wmX8YcNvM6FO1WMZOL+0pR3g31Ttb5qWh5WFqVcvxnsJP3W1ftZ7P+vQ/0haKKK/lM+5P8zz/AIKT/wDJ+/xa/wCxlvv/AEOv6kv+DZ//AJMx8Z/9jpcf+kNnX8tv/BSf/k/f4tf9jLff+h1/Ul/wbP8A/JmPjP8A7HS4/wDSGzr+pPET/kiqPpR/JHxOU/8AIyl/28f0Y1/Cb/wcR/G26+I/7ccPwygmZtP8CaRBaJHnKC5vP9ImcDsSrRof9wV/dlX+az/wVJ8Sz+LP+ChHxZ1adi23X7iBcnOFgxGBz2G2vz3wUwUaudVa8l/Dpu3q2l+Vz1uJKjjhlFdWfo//AMG5f7Ptj8Sv2tNa+M2tQLNbeAtM32+7kLe35MUZx6iMSkHsa/uHr+SH/ggN8Wvg3+y7+yB8Yf2jvjLq0Wj6XDrVnazSv80kn2e3LxxRIPmeR2mIVV5PsMmvnf8Aax/4OLv2iviHq91on7LOnQeB9DV2WG9u40u9SlQHhmDboYyRyVCvjpuPWvR4w4YzfiXiXExwkP3VLlhzSdor3U2r63d23ZJvuY5fjcPg8FB1HrK7st9z+2aiv8x/xZ/wUE/bk8bXcl74h+Lfix2lbcyQ6rcW8efaOF0QfQLWh4J/4KL/ALd3w+vodQ8NfFvxTugOUjutSmvIvxjuGkQj2K0n4G5hyXWLhzdrSt9//AD/AFmpX/hu3yP9NCiv40/2Pf8Ag44+K3hXV7Twt+2HpEXiPR5GCSaxpkawX0IP8bQgiKUDuF2H0z0P9dHwo+LPw5+OPw/034pfCjVoNb0HV4hNa3du2VdT1BBwVZTwysAykEEAivzXiTg7NMjmo46n7r2ktYv59H5Oz8j2cHmFDEq9J69up6JX+ZR/wUJ+OFx+0X+2n8SPiu0/n2t7rdzBYt2+w2jeRbY/7ZRqT7kmv9J34oeIJvCfwz8ReKbY4k0zTLu7U/7UMTOP5V/lNEliWPU1+q+BeCi62NxjWqUIr0k23/6SjwuJ6rUadPvd/d/w5/aV/wAG2H7POm+E/wBnnxV+0fqVsP7U8W6l/ZtrMyjK2GnjkIeoDzu+8dD5a+gr+lWv51v2Qv23fgJ/wTn/AOCR3wx8YfFW5NxqWtW13PpejWhDXl9NJcSOxUE/JGmR5kjfKuQOWKqfxK/aQ/4L7/tyfGfUrm1+Gl/b/D3RZCyxQaZGst1sPTfcShm3Y7oqc9K8TMeDM64nzzG4yjFRpe0lFTm2laD5Ulo27JdFa/W500cxw2Cw1OnJ3lZOy89T+96iv8wbWP25f20NeufterfFrxhK+SR/xOrtQM+gWUAfgK9b+GP/AAVQ/wCCgvwn1JNR8O/FXXb0LjMOrXB1OJgOxW68zH4EH3rvq+BuYqF6eLg5dmpJffr+RnHiajfWm7fI/wBJ6iv5d/2Dv+DiDw98QPEFh8MP2z9OtvDt1dusEPiOxytj5jcD7TExJhBPWRSUHVgoyw/qAtLu1v7WO+sZUmhmUPHJGQysrDIIIyCCOhFflmf8NZjktdUMwp8rez3jL0fX03XVI9vC4yjiI81KV/zRYooorwTqCiiigAooooA//9X+/iiiigAr/PF/4Li+H7jQf+CnnxJMykJfHS7uI4wGWTT7bJH/AAIMPqK/0Oq/iS/4OUvhVc+Gf2uPCnxYgh2Wninw6lu0g/jutOldXz9IpYRz6V+teDGLjS4gdN/8vKcor1TjL8os8HiKm5YS66NP81+p/OZWvoHiDXfCmt2niXwxeTadqNjKs9tc2zmKaKVDlWR1IKsDyCDkVkUV/VrSaaa0PhUz0v4q/Gb4sfHPxKvjL4x+ItQ8TaokK263WoztPIsSZIRSxOFBJOBgZJPU15pRRU0qUKcFCnFKK2SVkvRDlJyd29Qr+87/AIN9v2hPD/xa/YNsvhI06HW/h1e3WnXcBI3ta3cr3VtLtyTsKyNECcZaJq/gxr7P/YV/be+Kf7Bvxwtfi98Ogt7aSqLbVtKmcpBf2hILRsQDscY3RyAEo3YqWU/GeIHDE88yiWFo/wAWLU4X2ckmrX802u17Nno5TjVhsQpy+F6M9B/4KXfsM+OP2Hf2ktb8JXtjMPCOq3c134c1DaTDNZysWSLf082EHy3HXjdjDCvzvr/RW+C/7en/AATt/wCCjnw8i8Ja7e6LeyX4UXHhjxSkC3Cy9doimJSUj+9EWHvXXaP/AME7/wDgmV8D9Qb4op8PvCmkG0P2gXuobHgtyvIdPtDtHHjsVAxXwGD8Wq2X0I4POcFUWJiraaczWl9bNX625k912PWqZDGrJ1MPUXI/w/r5H49/8G7H7C/xA+H41v8AbG+KGnzaVFrdiNM8PW9wuyWe2dg81yVIDKjFVSIn743HGNpP5vf8HCfx+0b4uftvp8PvDdytza+AdLj0ycoQVF7KxmmXIJyUDIrejAg8g1+yf/BRn/gu38GPgt4Mv/hZ+xzqVv4p8aXMTWyarbAS6ZpYIx5isRsnlUf6tVDRg8uSBsb+J/WdZ1fxFq914g1+6lvr6+me4uLidzJLLLISzu7sSWZmJJJOSTXp8E5TmWZZxV4ozWl7O65acHultfXW1tNbczbdkrGOZV6NHDxwVB36t/1/SM2iiiv2I+dPY7T9ob47af8ACmb4F2Pi/VovBtwxeTRku5BZMS245iztwW+Yr0J5IzXjlFFZU6NOnzezild3dla77vu/MpybtdhX9sX/AAbR6JJZ/sm+NNcdcLe+Jiit6+VbxZ/LdX8Ttf6EX/BC74WS/DL/AIJyeD7q8haG58TTXmsyBhglZ5SkZ+jRxqw9jX5Z4y4qNLh/2T3nOK+68v0Pc4dg5Yvm7J/5H6/UUUV/J590FFFFAH+dt/wW18O3Xhz/AIKcfE6K4BCXk2nXcTEYDJPYW7cfRsr9RX6r/wDBsN4s02HxX8WPA8sgW7uLXTL2JD1aOJ5kcj/dLrn6iuM/4OW/2fb3RPjH4K/aX0u3/wBB13Tjol9Ii8C6snaSIufV4pCo9oq/Kj/gk9+1ra/scftq+GfiJ4ilMXhzVt+ia2QcBbO9wBKfaGURynjJVCB1r+rlSee8BRpYbWfsoq3eVK116tw09T4Xm+q5o5T25n90v+HP9HyioLa5t722jvLR1lilUOjqcqysMggjqCOlT1/KJ90FFFFABX+WT8ddc1uP43eMkS8nCjXNRAAkYAD7Q/vX+ptX+Vr8d/8AkuHjP/sO6j/6UPX754FJOtjr9ofnI+W4nfu0vn+h/eZ/wQnuLi6/4JpeCJrl2kc3OqZZjk/8fkvc1+v1fj3/AMEIP+UZ3gj/AK+dV/8ASyWv2Er8m4w/5HuP/wCvtT/0pnvZf/u1L/CvyP5Mv+Dn7/V/CH66v/7b1+VH/BCX/lJ14A/64av/AOm+4r9V/wDg5+/1fwh+ur/+29flR/wQl/5SdeAP+uGr/wDpvuK/oHhv/k3dT/r1X/OZ8rjP+RvH/FH9D/Qkr+QH/g5z+IV7P47+F/wsjci2tbG91R1zwZJpFiBI9hGcfWv6/q/jR/4ObfDt/b/Hj4b+KnU/ZbrQ7m2Vu3mQz7mH5OK/I/CaEJcS4fn6KdvXkf8AwT3c9bWDnby/M+CP+CGfwe034v8A/BRXwl/bcKXFn4Zt7vXZEcZG+1TbCf8AgMzxt+Ff6EtfwS/8G9fjjTfCP/BROx0fUG2t4j0HUtNhJ6eYAlyB+IgIHvX97Vet401Krz6EJ/CqcbfNyv8Aj+Rhw5GKwra3u7/gFFFFfkJ75m6zo+l+IdHu/D+uQJdWV9DJb3EMg3JJFKpV1YHqGUkEelf5a37RfwyT4LftAeOPg/Cxkj8L69qOlRu3Vks53iVvxVQfxr/U7r/L+/bZ8aaV8Rf2xPin460GRZbDVfFer3FtIvIeF7qQow/3lwfxr958C6lT61jYL4OWLfrd2/C58vxOo8lN9bs/s7/4N7viJf8Ajf8A4J6WWhX53f8ACMa3qGmRse8ZKXCj8POx+FfuNX4D/wDBuN4e1HR/2Cb/AFS8jKRat4pv7iAnoyJFBCSP+BxsPwr9+K/MuOoQjxBjlT29pL776/jc9nLG3hKV+yP8qX4w/wDJW/FP/YXvv/Rz1/bh/wAG7fwg0nwJ+wk/xIjiQah411m6uZ5QPnMNm32eJCfRSrsB2Ln1r+I/4w/8lb8U/wDYXvv/AEc9f3bf8ECPGGleJ/8Agm/4c0uwcNPoepalY3Kj+GQztMB+KSqfxr978XqlSPDVNQ2c4KXpyyf5pHy+QJPGyv2dvvP2kooor+WD7cK/B3/g4c+EGk+PP2EW+IkkKnUPBur2t1DLj5liuT5Eq564bcpI9QK/eKvxl/4L2+MdM8L/APBODxPpl84E2t32nWVupPLP56ynH0WMmvqeCKlSGf4F0t/aRXybs/wucWZJPC1VLazP4VPgF4/v/hT8c/BvxN0titx4f1uw1BNpwSbadJMfjjB9q/1Q0YOgdehGa/yjvAGh3/ifx3onhvSkMl1qF/bW0KDq0ksiqo/Emv8AVut4hBAkC9EUL+VfqvjtCHtcBJfFapf0Thb82eFww3y1V00/Ue7pEhkkIVVGSTwABX5v/Hn/AIK3fsBfs7ajPoPjjx9a3uqW25XstIR9RlV14KsYFZEbPZ3Wvwp/4L1f8FOfGsfxAvf2I/gXqcumafpcaDxRe2z7JbmeZQ4tFdeRGiFTLg5ZzsPCkN+CH7In7EX7Q/7cHjmbwX8C9I+2fZAr31/cv5VnaI54MshB5ODhQCzYOAcV5fC3hbh62XLN89xDpUmuZJNL3Xs5Sd0r9ElezWt9DfG53ONb2GFhzS2+fkkf1z3v/ByJ+wLazGO30fxlcqDjfHp9qAf++7xT+lU/+Ik39gz/AKF/xr/4AWf/AMnV+ffhL/g2J+KV5pUc/jj4qaXp96wy8Nlp8t3Gp9neSEn/AL5rqf8AiF+17/osdv8A+CVv/kquyWWeG0XyvFTdv+vn6QsZqtnD15F+H+Z5/wD8FUP+CyX7J37bn7JN98DPhbo3iW11ubUrK9gl1S0t4rdRbuS+WjupWyVJA+Xv2r+fz9l2WSD9pT4fzQnay+ItMII7f6Qlfrl+33/wQ/1T9hj9nG//AGgrv4ixeI0sry0tPsSaabYsbp9m7zDO+NvXG05r8if2Yv8Ak5DwD/2MOmf+lCV+qcJ0clp5JWjkU3Oheerv8XKrr3kntboeHj5Yl4mLxStLT7r+R/qXUUUV/Gp+hn+Z5/wUn/5P3+LX/Yy33/odf1Jf8Gz/APyZj4z/AOx0uP8A0hs6/lt/4KT/APJ+/wAWv+xlvv8A0Ov6kv8Ag2f/AOTMfGf/AGOlx/6Q2df1J4if8kVR9KP5I+Jyn/kZS/7eP6Ma/wAzj/gpFYXGm/t5/Fq0uRhx4lvmx7O5Yfoa/wBMev8APO/4Lh/DW7+HP/BR/wAcTSxGODxALTV4GI4kW4hUMR9JFYfUV8J4IYiMc2xFF7yp3Xykv8z0+JYN0IS7P9D8vF8Z+LpvBsfw1jvZjoovm1BbFSfLa7kRYvMKj7zbFCjOcDOOpz/Uh/wTk/4N+NH8W+DtO+M37b7XcB1FFuLTwtbObd0icZVryUfOrMDnykKleNzZyo/Hn/gjz8IfDXxp/wCChnw+8M+L4VudPsbmXVXhcZWR7GNpYwR3AkVSR3xiv9GqvrfFjjTF5XOnleWy9nKa55SW9m2kk+jdm299rPc4Miy6nXTr1ldLRI+D/DX/AATD/YA8KaUmkaV8KPD7RIu3dcWwnkPuXkLMT75rwH46/wDBEb/gnx8a9HuLax8IL4Q1GVSI7/QZGtnjb18o7oW+jIePSv1uor8FocTZvRq+2p4uopd+eX466/M+plgsPJcrpq3oj/Nd/wCChH/BPb4r/wDBPr4sr4I8aTLq+hamHm0bWoUMcd3ChwQyEny5UyN6bmAyCCQc198/8EE/26/EPwE/aRtf2a/F16z+C/iBN9niikJK2mqkYglT0ExHlSAYByrH7tfvp/wcB/DDQPG//BOjXfGeowq1/wCD9S03ULOXHzKZ7hLSRc+jJOSR3IHpX8KXwq8Q6h4R+J/hzxTpTtHc6dqdpcxMpwQ8UqsMfiK/pnh3H/638LVaePinP3oN2+1FJxmuz1T00vfpofGYul/Z+Oi6T00fy6o/1DfjvazX3wP8ZWVsN0k2h6iigd2a3cCv8rSv9Yi18nXdAj+3IHjvLceYp6ESLyP1r/LB+M3w41P4O/F7xT8JtaBF34Z1a90qXPd7SZoifx25r5DwKrxX1/Dv4vcfy95P7tPvPQ4ni/3U/X9DV8M6Z8YP2jfGvhj4VeHVuvEOrskOjaNZA7tkYYlY0B4RAWZmPAGSx7mv7E/2Mv8Ag3n/AGdfhn4Ys/En7V0j+OPFEyLJPYxyPBpdqxwdihCskxHILuQrdkHU/nh/wbPfBTw34v8Aj18QfjfrMKT3fgzTLOysQ4B8qXV3m3Sr6MI7ZkyP4ZGHev7Pa5vFTjnHYXHPJsum6UYJObjo25LmsmtlZp6btu5WR5ZTnT+sVlzN7X8tD4hg/wCCa/7BFtYDTYfhL4aEIXaAbJCcdPvHJ/WvgH9qn/ggD+xr8ZvDl3d/BO1k+HfiUKzW01m7zWLydlmt3Y4Q+sZRhnPOMV+7lFfkWC4rzjCVVWoYuaku8m0/VO6fzR79XA4epHllTVvQ/wAsv9oj9n34n/sufF/WPgj8X7H7BrejShJADujljYbo5Ym/ijkUhlPp1wQQP6u/+Ddn9uTxB8SfCOrfsc/Ea9e8u/CtqL/QZZW3P/Z+4JJBk9VhdlKAnhWwOFAHkH/Bzp8L9ChuPhd8ZrWBU1KcX2jXMo+9JDHsmhB/3C0uP976V+Tn/BDzxVe+Fv8Agpv8OBbMwi1I6lYzop++ktjcEA+wkVG/4DX9G5lWp8U8FTxteCVRQlP0nTve3ZSs/kz5GjF4LMlSi9G0vk/8j/Q7ooor+Uj7kKKKKACiiigD/9b+/iiiigAr8Df+Dhz9neb4r/sY2/xa0a382/8Ah9qKXkjKMsLK6xDN07BjGx9hntX75VyHxB8C+Gfih4F1n4ceNLYXmka9ZT2F5C3R4LhCjj24Jwe1ezw9m8srzLD4+P2JJtd1s181dHPi6CrUZ0n1R/lHUV9Kfte/s1+Lv2Rv2ifE/wABPGAZpdDu2W2uCMC6s3+aCZe2JIyCQCdrZXqDXzXX90YbE08RRhXoyvCSTT7pq6Z+Yzg4ScZLVBRRRW5IUUUUAKCVO5Tg1FFFFA7SQqEZ/vFRgn61JRQAUUUUAFFFFABRRRQB6J8Ivhl4l+NHxS8O/CTwdH5mqeJdRttNtgfuiS5cIGb0Vc5Y9gCa/wBSH4XfD3w/8JPhr4f+FnhRPL0zw3p1rplqp6+TaxrEmffCjJ7mv4+P+Dc79jm68e/GLVf2vfFdqf7I8Hh9P0l3Hyy6lcJiRl9fJhbB95B6HH9oVfy/40Z/HFZjTy2k7xoq8v8AHK2nyVvm2j7bhzCuFF1pby29EFFFFfi59EFFFFAHxv8At6fsj+HP22f2ZfEHwL1l0tr26jFzpV2wz9mv4MtC54J2k/I+OdjHHOK/zY/ih8MvHPwZ+IWsfCz4k6fLpWu6FdPaXlrKMMkkZ7HoVIwVYZDKQQSCK/1ZK/Gb/gqh/wAEk/BX7eOhf8LE8ASwaB8StNg2W95IuLe/jT7sFztBIx0SUAle4I4H634YceQyarLAY5/7PN3T/kltf/C+va1+54OdZW8RFVaXxr8V/mflv/wR1/4LSeF/CPhfSv2Uf2u9SFjbWIW10LxHcN+5SHolvdsfuBOiSn5QuA2AMn+tizvLTUbSK/0+VJ4J0WSOSNgyOjDIZSOCCOQR1r/LH+N/wD+MP7OHjy6+Gnxt0C78PazaMQ0NymFdQSA8bjKSRnB2uhKnsa+nP2Wf+Cm/7Zn7H9tFofwl8XTvoURBGj6iPtlioyTiNJCTECSSfKKZPJr7vi7wooZpN5lklWMZT1cfsSv1i1e1/Rp+R5eAz2VBexxMW0tL9V6n+lLRX8a3gv8A4ObfjhYWyxePfhvo2pSAcyWdzNa5P0bzRS+Mv+Dm343X1s0XgT4baLp0hHD3lzNc4P0XyhX5n/xCTiXn5fYK3fnjb87/AIHs/wBvYO1+b8Gf2SyyxwxtNMwREBZmY4AA6kmv8rH43XVte/GfxfeWUizQza1qDxyIQysrTuQQRwQRyCK+wP2o/wDgqb+2v+1xYz+Hfib4ultdBuMh9I0pfsVo6n+GQJ80q8dJGYe1fKfwO/Z++M37SXju1+G3wP8ADt54i1i6YARWqZWNSQC8shwkUa5G53ZVHc1+0eHnBdbhmliMTmNaN5qN7fDFRu7uTt37WVt2fO5tmMcbKEKMXpf1d/I/u5/4IQf8ozvBH/Xzqv8A6WS1+wlfC3/BNz9l7xd+xz+x74V+Anjy9t77WNLFzPdSWmTCsl1M8xRSwBYJv27sDOM4r7pr+aeJ8TSxGb4zEUJc0JVJtPunJtM+ywUJQw9OMlZpL8j+TL/g5+/1fwh+ur/+29flR/wQl/5SdeAP+uGr/wDpvuK/Vf8A4Ofv9X8Ifrq//tvX5Uf8EJf+UnXgD/rhq/8A6b7iv6I4b/5N3U/69V/zmfJ4z/kbx/xR/Q/0JK/CL/g4F/ZY1X48fscJ8VPCNobrWPhtdNqbogLSNpsqhLvAH/PMBJmz0SNq/d2qmoafZatYT6XqcST21zG0UsUg3I6OMMpB4IIOCK/nHIc3q5XmFHH0dZU5J27rZr5q6+Z9disOq9KVKWzR/lhfAr4w+K/2f/jD4c+NHgiTy9T8N38N9DyQHMTZKNj+F1yrD0Nf6WX7JX7VHwt/bG+CGk/Gz4U3qXFrfRhLu23AzWV2oHmW8y9VdCe/DKQwyrAn+MT/AIK3f8EkPHH7H/jO9+M/wY06bVPhfqkxk3QAySaPJIf9TOByISTiKXkfwMQ23f8AmZ+y5+2H+0J+xx42bxz8A/EE2kTz7Vu7Y/vLS7ROizQt8r4ycHG5cnBGa/pfijh3Bca5bRzHLKqVWK0b/GE7Xaae3bs07nxuCxdTLa0qNaPuv+ro/wBQSiv4+vh7/wAHOfxB0/R0tvih8LrHVL5Rhp9Ov3s0b32SRzY/Bq4L40/8HLPx98V6NNpPwU8EaZ4UlmQr9su521CaMn+JBtijyP8AaVhX45Dwl4llV9m6CS/mc429dG3+B9C8+wfLfm+Vn/X4n7s/8FeP+CgPhr9ir9nLUdE0HUEHxA8W2k1noltGw86BZAUe8I6qsQJKEjBkwOecf57ejaPqniPWbXQNFgku72/mS3ghiUvJJLKwVVVRklmYgADkmu3+KnxZ+KHx7+IF78SPitrF34i8Qao+Zrq5cySN/dVR0VV6KigKo4AAr+qb/giT/wAEh/EHgrW9N/bI/aj0lrK/twJ/DWiXiYlhcj5byeNuUcZzCjDcp+cgELX7Nl+Fy/gPI51MRUUq09X0c5W0jFb8q7+bbtex87VqVc0xKUFaK/Bd35n76/sG/s7f8Mqfsk+CPgdcAC90jT0a+wcg3lwTLPz3xI7Aewr67oor+WMZiqmJr1MTWd5zbk/Vu7Pt6cFCKhHZaH+VL8Yf+St+Kf8AsL33/o56/bb/AIIN/wDBQbw9+yz8YNR+AvxcvlsvB/jyWFoLuZtsVjqiDYjsScLHOpCO3YqhOACa/En4w/8AJW/FP/YXvv8A0c9e2/Ff9jb4wfC34DeCP2mJ7J7/AMGeN7UyQ6hAhaO1ukd0a3nx9xzs3ITw69CSrAf2zneAwOYZbHLcdKyrJRj35kuZW81a6XWx+b4arVpVnWpL4dX6ban+nWjpIgkjIZWGQRyCDTq/z5f2PP8Agtr+2N+yZoFr4CuLuDxt4ZslWK3sda3PJbxLwEinUiQKBwqsWVRwABxX6i/8RP8AP9g2/wDCn1+1Y+9/bB8vP0+zZx+NfzfmPhDxBh6zhh6aqw6SUorTzUmmvx9WfYUc/wAJON5vlfaz/Q/rTd1jUu5CqoySeAAK/hk/4Lyf8FC/DX7Unxa0/wCAHwevlvvCHgaaVrm8hbdDfam3yM0ZBw0cK5RWHDMzkZXaa8E/bD/4Lb/ti/tZeH7rwDb3Vv4K8M3qtHcWOjbkluI26pLcMTIVI4KqVDDggjivzO+CvwP+Kv7RPxF0/wCFXwb0W413XNTkCRQQLwoJ5eRjhY0XqzsQqjkmv0bgHw2lktV5vnE4qcE+VX0hprKUtr226Le7e3j5rnCxEfq+HTs9/PyR+jX/AARN/Zg1H9o/9vDwvqtzbs+heA5V8R6jKRlA9owa1jz0y9xs4PVFc9q/0L6/Ob/gmd/wT+8Lf8E//gNH4HWaLUvFWsMl3r2pRKQstwBgRRFgG8mIEhMgFiSxAJwP0Zr8l8RuKYZ3mzq0H+5prlh5q93L5vbyse9k+BeGocsvier/AMj/AC+/21dR1XV/2wPijqeubvtk/irV2m3ZzvN1Jkc88V/Yp/wbn6Z4Stf2C7rUtEWP+0rrxHe/2gwxv3okQjDd8BMEfU1+HH/BeL9hPxV8A/2nNS/aO8L2Ly+CviFcG9eeJcpZ6o4zcQyEdPNYGZCcA7mUfdNfGn/BPL/gpd8Z/wDgnt4wvLzwbBFrnhrWWQ6not05SOVk4EkTjJjlAyN2CCOGBwMfumeYCXFHCVGOVSTlaDSva7irOD7NPvpdLpqfM4aqsFj5OutNfx6n+kFRX85Xhf8A4OXP2PL7SopvGPg3xbp16UBkitYrS6iD9wsjXMJI9yg+lfPvx/8A+DmXw42iTab+zJ4Bu/t8qER3/iGRESJvX7PAz7/xlH0r8HoeGvElWqqX1Nrzbikvnf8AK59RLOMHGPN7RH0f/wAHG37QXgTwn+yfp/7PM06zeJPFup215HbKw3w2dixd5nHUBn2oucZOcfdNfx8/sxf8nIeAf+xh0z/0oSux+Iuu/tL/ALY+r+NP2mviHPeeI20GCG71rU5uILSKedLeCJBwiAySBY4k7bmxhWI479mL/k5DwD/2MOmf+lCV/SfCvDsMkyOpgFUU5pSc2tuZxTt5WVrX1a1tqfHY7FvE4lVbWWlvS5/qXUUUV/GR+iH+Z5/wUn/5P3+LX/Yy33/odf1Jf8Gz/wDyZj4z/wCx0uP/AEhs6/lt/wCCk/8Ayfv8Wv8AsZb7/wBDr+pL/g2f/wCTMfGf/Y6XH/pDZ1/UniJ/yRVH0o/kj4nKf+RlL/t4/oxr+XD/AIOTf2UL/wAUeBfCn7XvhW2Mr+G86JrZRSSLO4ffbSnHRY5i6E+sq+lf1H1w/wAS/hz4P+L3w/1j4Y+P7NNQ0XXbSWzvLd+jxSjafoe4I5B5r+fOFs+nk+aUcwgrqL95d4vSS+56edj6vHYVYihKk+v59D/Nj/4J8/tJWX7Jf7X/AIJ+OWsqzaXpd75WohBub7HcqYpmAHUorFwO5XFf6XHhjxN4e8a+HLDxf4RvYdS0vVLeO6tLu2cSQzwSqGR0YcMrKQQR1Ff503/BSH/gm18Wv2BfipcWeoW02p+BtTmZtE1xFJidDkiCYgYjnQcFTgOBuXIyBu/sNf8ABXD9qf8AYasY/BnhW5h8R+EFcuNE1Tc8UJc5YwOpDxZOSQCUySduTmv6A454QhxXhqGb5NVjKajbfSUd7X6Si29H3s7WPlMszB4GcsPiItK/3P8AVM/0WKK/l58H/wDBzn8ILrT8+Pfhfq9ldADiwvYbmNj3/wBYsRH614J8d/8Ag5k8Z61o1zo/7O/w+h0S5kBWPUdYuftbIDn5hBGqKG6EZdh9a/H6PhbxLUq+yeF5fNyjZfNSd/kmfQyzvBqPNz3+TPs//g4w/aj8LeB/2X7P9l6wuY5fEHja8trq4t1bLw6dYyCbewByN8yIEyOQrelfyS/sdfCPV/jt+1L4C+FGixNLLrGtWkb7Ru2wpIHlc+yxqzE9gK86+K3xZ+KX7QfxHvviV8VNWuvEXiLWJQ01xOd8jseFRFAwqr0RFAVRwABX9if/AAQx/wCCW2u/s46U37WHx/sDaeMtatTDo+mzriXTbKYfPJID92eYYG3qkeQeWYD9tksNwPwxKhOopV5c1v71SStot+WKtd9l3dj5tc+Z41SStFW+SX6s/o5t4Y7aBLeLhY1Cj6Div4Tf+Dgn9li++DP7Yj/G/SbbZoXxHhF5vRcIuoW6rHcL6ZYBJT6lya/u3r4+/bl/Y3+Hv7cv7P2p/BHx4TayyEXWmagihpLG+jB8uVR3Xkq65G5CRkHBH4NwFxOsjzeGKq/wpLln/hdtfk0n8rdT6fNMF9Zw7hH4lqvU/j4/4IDftd+Gf2b/ANrS9+HPxAu0sdC+I9pFpwuJCFji1G3ctal2PAVg8sf+865wM1/eRX+XP+01+y/8Zv2Qfi1ffCP4z6XJpupWTloJlBMF1Dk7J4JOA8bYyCOQeCAwIr9VP2O/+C+n7VH7N/h608A/FC0h+Iug2SCOA38rQ6hFGowEFyA28Dt5iO3vX7B4g+H1XPasc6yacZynFXV1aSS0lGW21k02tkeBlOarCxeGxKaSf3eTP7xKK/mO0/8A4OcPgNJpHn6p8M9dhv8Aaf3MV3byRbuw8whDg9z5fHvXwD+1T/wcXftC/Fzw5deDfgB4eg+H1tdoY5L8zm81AKeD5b7Y0jJHcIWHUEHmvy/BeFfEmIqqnPD8i6ylKNl9zbfyTPaq55g4Rup38kmav/Bx1+1P4Q+Kfx28Mfs7eCbqO9HgGG4l1aWJtypqF7s/cZHG6GNAXweGcqcFSK+f/wDg3z+D2r/EL/goRpnxCgiJsPA2mX+o3EhGU8y6heziTOMbiZmdf9wntX4+eCvA/wATPjr8RLXwf4IsLzxJ4l1652xQxAzT3E0hyWYk+uWZ2IAGSxABNf6Df/BKn/gntp37AfwBGg688V3418RmO8166i+ZFkA+S3jbHMcIJG7+JizcAgD9d4txeD4W4VWSUp81WcHBLq+a/PNrotXbzaXRngYCnUx2O+syVop3+7ZH6hUUUV/Lp9sFFFFABRRRQB//1/7+KKKKACiiigD8DP8Aguh/wTlu/wBqj4QJ+0D8JLIz+O/BMDGW3iXMmo6YMtJGo6tLCcyRj+Ib1ALFa/hUdHjcxyAqynBB4IIr/WdIDAqwyDX8ff8AwWo/4I96n4b1fVf2wP2WdNafSbovdeI9Dtly9rJyz3duoHMTdZUHKHLD5SQn754T8ewoKOSZhO0b/u5PZN/Yb838Pnp2Pls9ytyviaS16r9f8z+WSigjHBor+jD5AKKKKACiiigAooooAKKKKACvoL9l39mz4j/tafG7RPgb8L7Yzajq8wEkpBMdtbqf3s8h7JGvJ9TgDkiuB+FHwn+Ifxw+IGmfC34VaVPrWu6vMIbW1t13MxPUnsqqOWY4VQCSQBX+gd/wS1/4Jq+C/wDgn/8ACQnVBDqfxA19EfW9UUZCAcrawE8iGM9TwZG+Y8BVX4PjvjahkGDfK08RNe5H/wBuf91fi9F1a9TK8tliqmvwLd/p6n2x+zR+z34A/ZX+B/h74EfDSDydL0C2EIdv9ZPM3zSzSEdXkclmPqcDAAFe7UUV/HGIr1K9WVarK8pNtt7tvVs/QoxUYqMVZIKKKKyKCiiigAooooA8Q+Ov7NvwM/aY8KN4K+Onhmx8R2GDsF1GDJET1MUgw8Z90YGvwQ+Ov/BtL8APFt3NqvwD8cap4PeRmcWd/AuqWq55Cod0MqgdMs8hr+l6ivocm4rzfKtMBiZQXbeP/gLTX4HJiMDh6/8AFgn+f3n8TOv/APBs7+2Ha3rJ4Y8b+Dr227PczXttIf8AgC2ko/8AH60PCv8AwbMftX3l4E8b+PvCenW+Rl7I3l4+O/yyW9uPp83PtX9q1FfXPxf4k5eX2sb9+RX/AMvwOD+wMHe/K/vZ/ON8C/8Ag2z/AGXPAt3Dqnxu8V6v45miYMbeFF0uzfHZkRpZj+Ey1+7HwX/Z++C37O3hVPBfwT8NWHhvTlxujsoQhkI43SP95292JNew0V8fnHFGbZp/v+JlNdr2j/4CrR/A9DD4KhQ/hQS/P79wooorwDqPyK/4Kmf8EvtT/wCCjy+Dl0/xpF4R/wCEV+2bvMsDe+f9q8vpiaHbt8v3zntXyb+wT/wQk1v9iv8Aaj8PftG3nxMg8RR6Gl4hsE0lrVpftVvJB/rDcybdu/d905xjjrX9E9FfV4bjXOcPlrymjWth2pR5eWL0lfm1a5tbvrp0OGeW4edb6xKPv6O93028gooor5Q7inqOnafq9hNpeqwR3NtcIY5YZVDo6MMFWU5BBHUGvw5/ak/4IA/sZ/HzUbnxR8N3u/hxrNwWZjpSrNYM7HOWtZMAfSKSMV+6VFetlOe5hldT2uArypy62ej9Vs/mmYV8LSrR5asU0fxk+Lv+DY/9oWyvHTwH8SvDupW4PyPf29zZOR6lY1uQD7bj9a6b4ff8GxPxTu76Nvir8U9K0+2GC66TYzXjt6gGZrcD2OD9K/sQor7SXi1xM4cnt0n35IX/ACt+B5yyHB3vyfiz8rf2QP8Agjr+xj+x9qNt4s8PaRL4o8TWxDx6vrjLcSxOMcxRqqxRkEZDBN4/vV+qVFFfC5lmuMzCs6+NqyqT7yd/kuy8loenRoU6UeSnFJeQUUUV55qfyb+Mv+DZrxH4r8X6r4pX4x20A1K8nuhGdDZtnnOX25+2DOM4zgV+/v7L37H3hv4GfsgaF+yR8RZbTxppumWclndvcWgSC7SSRn5hdpAAN3948jNfZdFfVZxxrnOaUYYfG1+aMGpRtGMbNKyd4pPr3OHD5bh6EnOnGze+rf5n84v7Sn/Bt/8As3fEnU7jxH+z74mvvAFzMxf7DNF/aWng+iKzxzRgn/po4GeFxxX503v/AAbLftTx6iItO+IHhSW0zzLJ9sjkA/3BA4/8fr+1CivXwPijxJhaapRxPMltzRjJ/e1d/Ns56uSYOb5uS3o2j+Uv4Mf8Gx3h6zvodR/aB+J019AvMljoNkIM/wDbzOznHqPIB96/oU/Zj/Y1/Zw/Y/8AC58LfAPwzbaMsoAuLrBlu7kjvLO+Xb2Gdo7AV9QUV4ud8ZZzm0eTHYlyh/KrRj90Uk/nc6cNl2HoO9KFn33f4hRRRXzB2nG/ED4eeB/it4PvvAHxI0q21rRdSjMVzZ3cYlikU+qnuOoPUHkV/Ol+0X/wbW/Azxvqtx4g/Z08Z3vgtpWZ/wCzb+D+0rME/wAMb745o1H+0Za/pfor3sk4nzTKJOWX13C+60cX6xaa+drnLicFQxCtVjf8/vP4q5/+DZf9q1dQEVr4/wDCb2veRjeLJ/3wLcj/AMfr6s+B/wDwbJ+EtN1GHVf2iPiTPqsCEF9P0O0FqGx2NzM0jEHuBCpx0Ir+qiivqMT4rcS1qfs/rCj5xjFP77O3yscUMiwcXfkv6tn5r/Gz/gmh8HvFP7DXiL9iT9n+G08Aabrv2RvtiW5u232tzDcF5cyI8zsItu5pMjPoMV+O3wu/4NrfEXw5+JXh/wCID/GC2u10PUbW/MA0NkMgt5Fk27vthxu24zg49K/qxorxst45zzAUatDDYh8tRuUrqMm20k23JN6pLqdFbLMNVlGU4arRbr8gooor5I7z+Yb9pn/g3d1/9oT9oDxf8boPixb6UnijU59RWzbRmmMImbOwv9rTdj12j6V+qv8AwTD/AGBL/wD4J3/BTW/hHqHiiPxY+r63Jq4uo7M2QjEkEMPl7DLLnHlZ3bh1xjiv0kor6rMuNc5x+BWXYqtzUVay5Yr4dtUk9PU4aOW4elVdaEbS16vqFFFFfKnccZ8QPh14E+K3hK88B/EnSLXXNGv08u4s7yJZYpF91YHkdQeoPSv58f2jP+Dbn9nD4hahPr/7Pviq/wDAVxKS/wBhuIhqdiD/AHUDPHMgJ7mR8dl7V/SDRXu5LxNmmUycsvryhfdbxfrF3T+45sTg6NdWqxv/AF3P4ldd/wCDZ79se2vmTw1428G3lqPuvcT3tvIfqi2coH/fZrvfht/wbH/HnUL9P+Fv/ErQNItQ3zf2Pb3GoyFfQectoAT68496/stor7Cfi7xJKHKqsU+6hG/46fgeesgwad+V/ez8rP2Nv+CPH7HX7G19b+LNA0yXxT4ot8Mmsa3snkifjmGNVWKLBGQQpcf3jX6p0UV8FmWa4zMKzxGNquc+7d/kuy8loepRoU6UeSnGyCiiivPNTwL9ob9l74D/ALVXgs+A/jz4btfEFgMmIzLtmgY9WilXDxn1KkZ71/O58c/+DZXwRqt7Lqv7OnxHudIjbJXT9dtRdoCewuITGyqOwMTn1Jr+qCivpcj4vzfKFy4DEOMf5dJR/wDAXdfNWZx4nAYfEa1YXffr95/ELdf8G0X7biXLJZeL/BEkOTtd7u/RiOxKiwbB9gTX0Z8HP+DYzxRLew3n7QHxOtbe3Qgy2nh+0eZ5B3C3Fz5QT2Jgb6V/XdRX02I8W+JKkORVox81CN/xv+RxRyHBp35W/mz4o/ZG/wCCfH7LX7E2jmz+CHh5IdSmjEdzq94ftGoTjjO6UgbQSMlUCpntX2vRRX59jMbiMXWliMVUc5vdyd3+J61OnCnFQgrIKKKK5SwooooAKKKKAP/Q/v4ooooAKKKKACmuiyKUcAqRgg8ginUUAfzNf8FMP+CCnhv4uXmofG39jGG20LxFPvuLzw6xENjeSHktbHhYJGP8BxESf4OSf4/viR8MviF8HvGV78Pfinot5oGt6c+y4sr6JoZUPY4YcgjlWGQw5BIr/Vmr5h/aY/Y2/Zu/a88NDw38e/C1prXlKVt7wr5d5bbv+eU6YkXnkjO09wa/Y+D/ABbxeXRjhMzTq0Vopfbivn8S9bPz6Hz2YZDTrNzo+7L8H/kf5ftFf1Y/tNf8G0viW1muNe/ZM8aQXcOSyaT4gBikA64S6iVlY9gHjX3avxC+Lv8AwTA/b6+CFzLF46+F2ttBFkm606H+0rbaO/m2plUDv8xB9q/eso43yPMop4bFR5n9mT5ZfdKzfyuj5bEZbiaL9+Dt3WqPguit/UPCvijSZmt9V026tpEOGWWF0II7EECs0abqJOFt5Cf9w/4V9SpxaumcVmUqK9L8GfBf4v8AxF1FdI8AeFtX1u6bpFY2U1w5z7IpNfpb8Bv+CHP/AAUP+OE8E974RTwVpsuCbzxHMLQqP+vdRJc5+sQHuK8zMM8y7Axc8ZiIQXnJJ/Jbv5G1LC1qrtTg38j8h6+4/wBi3/gnp+0n+3R4sGj/AAf0ho9Ht5Al/rl4rR6fa9yDJj55MdI0yx6kAcj+pb9lL/g3W/Zt+FFxbeJv2i9XuPiDqkRV/saqbPTVYdiisZJAD/ecA91r+gXwl4Q8K+AvDlp4P8EabbaRpOnxiK2s7OJYIIUH8KIgCqPoK/IeJ/GfC0oyo5LDnn/PJWivNJ6y+dl67H0GC4dnJqWJdl2W/wDwD4K/4J+f8E1PgV/wT/8ABbWvguL+1/FeoxKmqa/coBcT9CY4xz5UIIyEU8kAsSQMfovRRX875hmOJx2InisXUc6kt2/60XZLRdD62lRhSgoU1ZIKKKK4jQKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//0f7+KKKKACiiigAooooAKKKKACiiigDD1Xwx4b10Y1vT7a8H/TeJJOn+8DWBH8LfhlC/mReHNLVuuRZxA/8AoNd3RWiqzSspP7xOK7FW0srKwi8ixhSFB/DGoUfkKtUUVm3fcYUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//0v7+KKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/T/v4ooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k=';

// ══ PRINT ENGINE ══════════════════════════════════════
function buildProfileHTML(data, full = true) {
  // Usa el mismo renderResultado pero en string
  const listas  = data.listas || {};
  const hits    = Object.entries(listas).filter(([, e]) => e.coincidence);
  const hitsStr = hits.map(([nombre, entry]) => {
    let detHtml = '';
    if (entry.data) {
      try { detHtml = renderDetailEntries(entry.data); } catch(e) {}
    }
    return `
      <div style="margin-bottom:12px;padding:10px 14px;border:1px solid #ccc;border-radius:8px">
        <div style="font-weight:700;color:#c00;margin-bottom:6px">${nombre} — ${(entry.risk||'').toUpperCase()}</div>
        ${detHtml || '<div style="color:#888;font-size:12px">Sin detalle adicional</div>'}
      </div>`;
  }).join('');

  const fichaRows = Object.entries(data.ficha || {})
    .filter(([,v]) => v)
    .map(([k,v]) => `<tr><td style="font-weight:600;padding:5px 10px;background:#f5f5f5;border:1px solid #ddd">${k}</td>
                         <td style="padding:5px 10px;border:1px solid #ddd">${v}</td></tr>`)
    .join('');

  return `
    <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #eee">
      <h2 style="margin:0 0 4px">${data.nombre || data.razon_social || data.dni}</h2>
      <p style="color:#666;margin:0;font-size:12px">
        DNI: ${data.dni} &nbsp;·&nbsp; Riesgo: <b>${data.riesgo_final||'—'}</b>
        &nbsp;·&nbsp; Tipo: ${data.ficha?.['Tipo de persona']||'—'}
      </p>
    </div>
    ${hits.length > 0 ? `<div style="background:#fff0f0;border:1px solid #f99;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-weight:700;color:#c00">⚠ ${hits.length} alerta(s) detectada(s)</div>` : '<div style="background:#f0fff4;border:1px solid #9f9;border-radius:6px;padding:10px 14px;margin-bottom:16px;color:#2a7;font-weight:700">✓ Sin alertas</div>'}
    ${fichaRows ? `<table style="border-collapse:collapse;width:100%;margin-bottom:16px;font-size:12px">${fichaRows}</table>` : ''}
    ${hitsStr ? `<h3 style="margin:16px 0 8px;color:#c00">Coincidencias en listas</h3>${hitsStr}` : ''}`;
}

function buildCarouselPrintHTML(fichas) {
  return fichas.map((r, i) => {
    const nombre = [r.Nombre, r['Apellido paterno']].filter(Boolean).join(' ') || r['Razón Social'] || r.DNI;
    const LISTAS_ALL = [
      'Coincidencia_Causas penales Chile','Coincidencia_PEP Chile',
      'Coincidencia_Funcionarios Públicos Chile','Coincidencia_PDI',
      'Coincidencia_Países Sancionados (GAFI)','Coincidencia_Organismos internacionales',
      'Coincidencia_OFAC Domicilio','Coincidencia_Screening Global',
      'Coincidencia_RTP','Coincidencia_BIC','Coincidencia_Palabras Clave',
      'Coincidencia_Comentarios de Riesgo','Coincidencia_Lista de interés','Coincidencia_Lista Regcheq'
    ];
    const hitsList = LISTAS_ALL.filter(k => r[k] === true || r[k] === 'True')
      .map(k => `<li style="color:#c00;font-weight:700">${k.replace('Coincidencia_','')}</li>`).join('');

    let causasHtml = '';
    if (r.causas_penales_data) {
      try {
        const casos = JSON.parse(r.causas_penales_data);
        if (casos.length > 0) {
          const hdrs = ['Delito','Estado','Fecha','Riesgo','RIT','RUC','Tribunal'];
          const rows = casos.map(c => `<tr>
            <td>${c.crimen||'—'}</td><td>${c.estado||'—'}</td><td>${c.fecha||'—'}</td>
            <td style="color:${c.riesgo==='high'?'#c00':c.riesgo==='medium'?'#c60':'#070'};font-weight:700">${(c.riesgo||'').toUpperCase()}</td>
            <td>${c.rit||'—'}</td><td>${c.ruc||'—'}</td><td>${c.tribunal||'—'}</td>
          </tr>`).join('');
          causasHtml = `
            <h4 style="color:#900;margin:14px 0 6px">⚖ Causas Penales Chile (${casos.length})</h4>
            <table style="border-collapse:collapse;width:100%;font-size:10px">
              <thead><tr>${hdrs.map(h=>`<th style="background:#7b0000;color:#fff;padding:4px 6px;text-align:left">${h}</th>`).join('')}</tr></thead>
              <tbody>${rows}</tbody>
            </table>`;
        }
      } catch(e) {}
    }

    return `
      <div style="page-break-after:${i < fichas.length-1 ? 'always' : 'auto'};padding:20px;
                  font-family:Arial,sans-serif;font-size:12px">
        <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #eee">
          <h2 style="margin:0 0 4px;font-size:18px;color:#1a1a1a">${nombre}</h2>
          <p style="margin:0;color:#666;font-size:12px">
            DNI: ${r.DNI} &nbsp;·&nbsp; Riesgo: <b>${r['Riesgo final Ficha']||'—'}</b>
            &nbsp;·&nbsp; Tipo: ${r['Tipo de persona']||'—'}
          </p>
        </div>
        ${hitsList ? `<div style="background:#fff0f0;border:1px solid #f99;padding:10px;border-radius:6px;margin-bottom:12px"><b style="color:#c00">⚠ Alertas:</b><ul style="margin:6px 0 0 16px;padding:0">${hitsList}</ul></div>`
                   : `<div style="background:#f0fff4;border:1px solid #9f9;padding:8px 12px;border-radius:6px;margin-bottom:12px;color:#2a7;font-weight:700">✓ Sin alertas</div>`}
        ${causasHtml}
      </div>`;
  }).join('');
}

function _openPrintWindow(bodyContent) {
  const w    = window.open('', '_blank', 'width=960,height=760');
  const now  = new Date();
  const fecha = now.toLocaleDateString('es-CL', { day:'2-digit', month:'long', year:'numeric' });
  const hora  = now.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });

  // Header con logo y fecha
  const printHeader =
    '<div class="print-page-header">' +
      '<img src="' + LOGO_B64 + '" alt="Logo" class="print-logo">' +
      '<div class="print-header-center">' +
        '<div class="print-title">Informe de An\u00e1lisis de Perfil</div>' +
        '<div class="print-subtitle">Regcheq \u00b7 An\u00e1lisis Criminal</div>' +
      '</div>' +
      '<div class="print-date">' +
        '<div>' + fecha + '</div>' +
        '<div style="font-size:10px;color:#888">' + hora + '</div>' +
      '</div>' +
    '</div>';

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<title>Informe Regcheq \u2014 ' + fecha + '</title>' +
    '<style>' +
    '* { box-sizing: border-box; }' +
    'body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; margin: 0; padding: 0; }' +
    '.print-page-header { display: flex; align-items: center; gap: 16px; padding: 14px 24px; border-bottom: 3px solid #7b0000; background: #fafafa; }' +
    '.print-logo { height: 52px; width: auto; object-fit: contain; flex-shrink: 0; }' +
    '.print-header-center { flex: 1; }' +
    '.print-title { font-size: 15px; font-weight: 800; color: #7b0000; }' +
    '.print-subtitle { font-size: 11px; color: #888; margin-top: 2px; }' +
    '.print-date { text-align: right; font-size: 12px; font-weight: 600; color: #333; white-space: nowrap; }' +
    '.no-print { background: #f5f5f5; border-bottom: 1px solid #ddd; padding: 10px 24px; display: flex; gap: 10px; align-items: center; }' +
    '.print-body { padding: 20px 24px; }' +
    'table { border-collapse: collapse; width: 100%; }' +
    'th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; }' +
    'th { background: #f0f0f0; font-weight: 700; }' +
    'h2 { font-size: 17px; margin: 0 0 4px; }' +
    'h3 { font-size: 14px; color: #7b0000; margin: 18px 0 8px; }' +
    'h4 { font-size: 12px; color: #900; margin: 14px 0 6px; page-break-after: avoid; }' +
    '@media print {' +
    '  .no-print { display: none !important; }' +
    '  .print-body { padding: 8px 0; }' +
    '  table { font-size: 10px; }' +
    '  td, th { padding: 4px 6px; }' +
    '  .print-page-header { border-bottom: 2px solid #7b0000; margin-bottom: 12px; }' +
    '}' +
    '</style></head><body>' +
    '<div class="no-print">' +
      '<button onclick="window.print()" style="padding:8px 22px;background:#7b0000;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px">' +
        '🖨 Imprimir / Guardar PDF' +
      '</button>' +
      '<button onclick="window.close()" style="padding:8px 18px;background:#fff;border:1px solid #ccc;border-radius:6px;cursor:pointer;font-size:13px">\u2715 Cerrar</button>' +
      '<span style="margin-left:auto;font-size:11px;color:#888">Generado el ' + fecha + ' a las ' + hora + '</span>' +
    '</div>' +
    printHeader +
    '<div class="print-body">' + bodyContent + '</div>' +
    '</body></html>';

  w.document.write(html);
  w.document.close();
}

// ── LISTA DE INTERÉS ──────────────────────────────────
async function cargarLista() {
  document.getElementById('lista-content').innerHTML =
    '<div style="color:var(--muted);font-size:13px">Cargando...</div>';
  try {
    const res  = await fetch('/api/lista');
    const data = await res.json();
    if (data.error) {
      document.getElementById('lista-content').innerHTML =
        `<div class="alert alert-err">${data.error}</div>`;
      return;
    }
    renderLista(data.registros || []);
  } catch(e) {
    document.getElementById('lista-content').innerHTML =
      `<div class="alert alert-err">Error: ${e.message}</div>`;
  }
}
function renderLista(registros) {
  if (!registros.length) {
    document.getElementById('lista-content').innerHTML =
      '<div style="color:var(--muted);font-size:13px">La lista está vacía.</div>';
    return;
  }
  const rows = registros.map(r => `
    <tr>
      <td><code style="color:var(--primary);font-size:12px">${r.dni || '—'}</code></td>
      <td style="font-weight:600">${r.name || '—'}</td>
      <td><span class="badge ${r.personType === 'legal' ? 'badge-medium' : 'badge-none'}">${r.personType || '—'}</span></td>
      <td style="color:var(--muted);font-size:12px;max-width:220px">${r.reason || '—'}</td>
      <td><span class="badge ${r.status === 'active' ? 'badge-low' : 'badge-none'}">${r.status || '—'}</span></td>
      <td style="color:var(--muted);font-size:12px">${r.created_at ? r.created_at.slice(0,10) : '—'}</td>
      <td>
        <button class="btn btn-outline" style="padding:4px 10px;font-size:11px"
          onclick="desactivar('${r.id}','${r.dni}','${(r.name||'').replace(/'/g,"\\'")}','${r.personType}','${(r.reason||'').replace(/'/g,"\\'")}')">
          Desactivar
        </button>
      </td>
    </tr>`).join('');
  document.getElementById('lista-content').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>DNI/RUT</th><th>Nombre</th><th>Tipo</th><th>Razón</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--muted)">${registros.length} registro${registros.length !== 1 ? 's' : ''}</div>`;
}
async function agregarLista() {
  const payload = {
    dni:        document.getElementById('add-dni').value.trim(),
    nombre:     document.getElementById('add-nombre').value.trim(),
    personType: document.getElementById('add-tipo').value,
    razon:      document.getElementById('add-razon').value.trim(),
    status:     'active',
  };
  if (!payload.dni || !payload.nombre || !payload.razon)
    return alert('DNI, nombre y razón son obligatorios');
  const res  = await fetch('/api/lista', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  document.getElementById('add-form').style.display = 'none';
  ['add-dni','add-nombre','add-razon'].forEach(id => document.getElementById(id).value = '');
  cargarLista();
}
async function desactivar(id, dni, nombre, tipo, razon) {
  if (!confirm(`¿Desactivar registro de ${nombre}?`)) return;
  const res = await fetch('/api/lista', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dni, nombre, personType: tipo, razon, status: 'inactive' })
  });
  const data = await res.json();
  if (data.error) return alert(data.error);
  cargarLista();
}
</script>
</body>
</html>
"""

# ─── JOBS en memoria ──────────────────────────────────────────────────────────
import uuid, json, queue

_jobs: dict[str, dict] = {}

# ─── MAPA DE LISTAS ───────────────────────────────────────────────────────────
NOMBRE_LISTA = {
    "pepChile":                  "PEP Chile",
    "funcPublicChile":           "Funcionarios Públicos Chile",
    "secondCriminalCasesChile":  "Causas Penales Chile",
    "pdiResult":                 "PDI",
    "gafiResult":                "GAFI — Países sancionados",
    "internationalOrganizations":"Org. Internacionales (OFAC/ONU/UE)",
    "ofacAddressResult":         "OFAC Domicilio",
    "screeningGlobal":           "Screening Global",
    "rtpResult":                 "RTP (alto riesgo nacionalidad)",
    "keywordsResult":            "Keywords (cargo/posición)",
    "riskComments":              "Comentarios de Riesgo",
    "internList":                "Lista Interna Empresa",
    "regcheqList":               "Lista Regcheq",
    "bicResult":                 "BIC",
}

# ─── RUTAS ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/api/analizar", methods=["POST"])
def analizar():
    data  = request.json
    tipo  = data.get("tipo", "natural")
    dni   = data.get("dni", "").strip()
    crear = data.get("crear_ficha", False)

    if not dni:
        return jsonify({"error": "DNI requerido"}), 400

    ficha_data = {"dni": dni, "personType": tipo}
    mapa_nat   = {"nombre": "name", "apellido": "fatherName", "apellido2": "motherName",
                  "nacionalidad": "nationality", "cargo": "position",
                  "email": "email", "telefono": "phone"}
    mapa_leg   = {"razon_social": "socialReason", "tipo_empresa": "businessType",
                  "email": "email", "pais": "country"}

    if tipo == "natural":
        for k, campo in mapa_nat.items():
            v = data.get(k, "").strip()
            if v:
                ficha_data[campo] = v.upper() if campo in ("name", "fatherName", "motherName") else v
    else:
        for k, campo in mapa_leg.items():
            v = data.get(k, "").strip()
            if v:
                ficha_data[campo] = v
        if data.get("rep_dni"):
            ficha_data["personsRelations"] = [{
                "dni": data["rep_dni"], "personType": "natural", "type": "representant",
                "name": data.get("rep_nombre", "").upper(),
            }]

    try:
        if crear:
            api.crear_ficha(ficha_data)
        perfil = api.obtener_ficha(dni)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Construir listas CON campo data (detalle de coincidencia)
    listas_raw = perfil.get("listas") or {}
    listas = {}
    for clave, nombre in NOMBRE_LISTA.items():
        entry = listas_raw.get(clave)
        if entry is None:
            continue
        raw_data = entry.get("data")
        # Limpiar strings vacíos
        if isinstance(raw_data, str) and not raw_data.strip():
            raw_data = None

        listas[nombre] = {
            "coincidence": bool(entry.get("coincidence", False)),
            "risk":        entry.get("risk", ""),
            "data":        raw_data,        # ← detalle completo de la coincidencia
        }

    # Campos del perfil para mostrar
    ficha_display = {}
    for k, label in [
        ("name",         "Nombre"),
        ("fatherName",   "Apellido paterno"),
        ("motherName",   "Apellido materno"),
        ("nationality",  "Nacionalidad"),
        ("country",      "País"),
        ("email",        "Email"),
        ("phone",        "Teléfono"),
        ("position",     "Cargo"),
        ("employer",     "Empleador"),
        ("birthDate",    "Fecha nacimiento"),
        ("socialReason", "Razón Social"),
        ("businessType", "Tipo empresa"),
    ]:
        v = perfil.get(k)
        if v:
            ficha_display[label] = str(v)

    return jsonify({
        "dni":          dni,
        "nombre":       perfil.get("name") or perfil.get("socialReason") or "",
        "razon_social": perfil.get("socialReason") or "",
        "riesgo_calc":  perfil.get("calculatedRisk") or "",
        "riesgo_final": perfil.get("effectiveRisk") or perfil.get("calculatedRisk") or "",
        "pep_level":    perfil.get("pepLevel") or "",
        "listas":       listas,
        "ficha":        ficha_display,
        "decision":     {},
    })


# ─── Masivo Upload ─────────────────────────────────────────────────────────────

@app.route("/api/masivo/upload", methods=["POST"])
def masivo_upload():
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "No se recibió archivo"}), 400

    from procesador_masivo import leer_excel_input
    import tempfile

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    f.save(tmp.name)

    try:
        filas, tiene_crimenes = leer_excel_input(tmp.name)
    except Exception as e:
        return jsonify({"error": f"Error leyendo Excel: {e}"}), 400

    if not filas:
        return jsonify({
            "error": "El archivo no contiene datos o no tiene columna 'rut'/'dni'. "
                     "Verifica que la primera hoja tenga esas columnas."
        }), 400

    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "tmp_path":       tmp.name,
        "filas":          filas,
        "tiene_crimenes": tiene_crimenes,
        "crear_fichas":   request.form.get("crear_fichas") == "true",
        "delay":          float(request.form.get("delay", 0.5)),
        "limite":         int(request.form.get("limite", 0) or 0),
        "q":              queue.Queue(),
        "results":        None,
        "done":           False,
    }
    return jsonify({"job_id": job_id, "total": len(filas), "tiene_crimenes": tiene_crimenes})


@app.route("/api/masivo/stream/<job_id>")
def masivo_stream(job_id):
    job = _jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job no encontrado"}), 404

    def procesar():
        from procesador_masivo import consultar_persona, extraer_crimenes, extraer_dni
        filas          = job["filas"]
        tiene_crimenes = job["tiene_crimenes"]
        crear          = job["crear_fichas"]
        delay          = job["delay"]
        limite         = job["limite"]
        q              = job["q"]

        if limite:
            filas = filas[:limite]

        resultados = []
        for i, fila in enumerate(filas, 1):
            dni = extraer_dni(fila) or "—"
            resultado, error = consultar_persona(fila, crear)
            resultado.setdefault("DNI", dni)

            if error:
                resultado["regcheq_error"] = error
                q.put({
                    "type": "progress", "current": i, "total": len(filas),
                    "dni": dni, "error": error[:80], "alertas": 0,
                })
            else:
                resultado["regcheq_error"] = ""

                # Contar alertas de listas para el log en tiempo real
                alertas = sum(
                    1 for col, val in resultado.items()
                    if col.startswith("Coincidencia_") and val is True
                )

                if tiene_crimenes:
                    crimenes = extraer_crimenes(fila)
                    if crimenes:
                        ev = evaluar_crimenes(crimenes)
                        resultado["Decision"]            = ev["decision"]
                        resultado["Decision_Razon"]      = ev["razon"]
                        resultado["Precedentes_count"]   = ev["precedentes_count"]
                        resultado["NoPrecedentes_count"] = ev["noprecedentes_count"]
                        resultado["Total_equivalente"]   = ev["total_equivalente"]
                    else:
                        resultado["Decision"]            = "Liberar"
                        resultado["Decision_Razon"]      = "Sin crímenes"
                        resultado["Precedentes_count"]   = 0
                        resultado["NoPrecedentes_count"] = 0
                        resultado["Total_equivalente"]   = 0.0

                q.put({
                    "type": "progress", "current": i, "total": len(filas),
                    "dni": dni,
                    "riesgo": resultado.get("Riesgo final Ficha", "—"),
                    "alertas": alertas,
                })

            resultados.append(resultado)
            if i < len(filas) and delay > 0:
                time.sleep(delay)

        job["results"] = resultados
        job["done"]    = True
        errores = sum(1 for r in resultados if r.get("regcheq_error"))
        q.put({"type": "done", "total": len(resultados), "errores": errores})

    threading.Thread(target=procesar, daemon=True).start()

    def generate():
        while True:
            try:
                msg = job["q"].get(timeout=120)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg["type"] in ("done", "error"):
                    break
            except queue.Empty:
                yield f"data: {json.dumps({'type':'error','message':'Timeout'})}\n\n"
                break

    from flask import Response
    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/api/masivo/download/<job_id>")
def masivo_download(job_id):
    job = _jobs.get(job_id)
    if not job or not job.get("done"):
        return jsonify({"error": "Resultado no disponible aún"}), 404

    from procesador_masivo import escribir_excel_output
    import tempfile

    tmp_out = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    escribir_excel_output(tmp_out.name, job["results"], job["tiene_crimenes"])

    nombre = f"resultado_regcheq_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return send_file(tmp_out.name, as_attachment=True, download_name=nombre,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@app.route("/api/masivo/results/<job_id>")
def masivo_results(job_id):
    job = _jobs.get(job_id)
    if not job or not job.get("done"):
        return jsonify({"error": "Resultado no disponible aún"}), 404
    # Devolver resultados sin la columna interna causas_penales_data (va serializada aparte)
    results_out = []
    for r in job["results"]:
        entry = {k: v for k, v in r.items()}
        results_out.append(entry)
    return jsonify({"results": results_out})


# ─── Lista de interés ──────────────────────────────────────────────────────────

@app.route("/api/lista", methods=["GET"])
def get_lista():
    try:
        data = api.obtener_lista_interes()
        return jsonify({"registros": data if isinstance(data, list) else []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/lista", methods=["POST"])
def post_lista():
    d      = request.json
    dni    = d.get("dni", "").strip()
    nombre = d.get("nombre") or d.get("name") or ""
    tipo   = d.get("personType", "natural")
    razon  = d.get("razon") or d.get("reason") or ""
    status = d.get("status", "active")
    if not dni or not nombre or not razon:
        return jsonify({"error": "dni, nombre y razon son requeridos"}), 400
    try:
        res = api.agregar_lista_interes(dni, nombre, tipo, razon, status)
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── MAIN ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        _init()
        _cargar_catalogo()
        print("  ✓ Motor de decisión cargado")
    except Exception as e:
        print(f"  ⚠ Motor de decisión no disponible — {e}")

    print("\n" + "─" * 52)
    print("  REGCHEQ — Servidor Local")
    print("  http://localhost:5050")
    print("─" * 52 + "\n")
    app.run(host="0.0.0.0", port=5050, debug=False, threaded=True)
