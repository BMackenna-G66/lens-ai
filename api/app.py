from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import mysql.connector
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
import io
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the React frontend

LOGO_PATH = os.path.join(os.path.dirname(__file__), "logo_global.jpg")

DB_CONFIG = {
    'user':     os.environ.get('DB_USER',     'bmackenna'),
    'password': os.environ.get('DB_PASSWORD', 'ru69c6@yXA@8'),
    'host':     os.environ.get('DB_HOST',     'db-prod-ro.global66.com'),
    'port':     int(os.environ.get('DB_PORT', 3306)),
    'connect_timeout': 10,
}

# --- Secciones disponibles y sus queries ---
SECTIONS = {
    "info_basica": {
        "label": "Informacion basica del cliente",
        "query": """
            SELECT
                customer_id,
                name,
                last_name,
                email,
                phone_number,
                calling_code,
                country_code,
                nationality_code,
                sex,
                birth,
                risk_level,
                is_pep,
                platform,
                created_date,
                last_connection_date,
                current_connection_ip
            FROM customer.customer_v2
            WHERE {filter}
            LIMIT 1
        """,
        "type": "single"
    },
    "kyc": {
        "label": "Estado KYC (más reciente)",
        "query": """
            SELECT
                kyc_id,
                kyc_status,
                kyc_stage,
                status_comment,
                country_code,
                kyc_agent,
                kyc_channel,
                created_at,
                stage_expires_at
            FROM customer.customer_kyc
            WHERE customer_id = {cid}
            ORDER BY kyc_id DESC
            LIMIT 1
        """,
        "type": "single"
    },
    "compliance": {
        "label": "Compliance (más reciente)",
        "query": """
            SELECT
                compliance_id,
                compliance_status,
                compliance_agent,
                compliance_channel,
                agent_comment,
                agent_observation,
                status_created_at
            FROM customer.compliance
            WHERE customer_id = {cid}
            ORDER BY compliance_id DESC
            LIMIT 1
        """,
        "type": "single"
    },
    "kyc_verificaciones": {
        "label": "Verificaciones KYC",
        "query": """
            SELECT
                kyc_verification_id,
                verification_category,
                verification_status,
                status_comment,
                status_observation,
                verification_method,
                kyc_verifier,
                verified_at
            FROM customer.compliance_kyc_verification
            WHERE customer_id = {cid}
            ORDER BY verified_at DESC
        """,
        "type": "table"
    },
    "direccion": {
        "label": "Direccion",
        "query": """
            SELECT
                address_line,
                locality,
                sub_locality,
                administrative_area,
                sub_administrative_area,
                postal_code,
                address_country_code,
                created_at,
                updated_at
            FROM customer.address
            WHERE customer_id = {cid}
            ORDER BY updated_at DESC
            LIMIT 5
        """,
        "type": "table"
    },
    "transacciones": {
        "label": "Transacciones",
        "query": """
            SELECT
                transaction_id,
                start_date,
                tx_status,
                origin_amount,
                origin_currency,
                destiny_amount,
                destiny_currency,
                destiny_country,
                exchange_rate,
                fee,
                beneficiary_name,
                beneficiary_dni,
                payment_method,
                way_transfer
            FROM transaction.transaction
            WHERE customer_id = {cid}
              AND start_date >= DATE_SUB(NOW(), INTERVAL {days} DAY)
            ORDER BY start_date DESC
        """,
        "type": "table"
    },
    "beneficiarios": {
        "label": "Beneficiarios",
        "query": """
            SELECT
                beneficiary_id,
                name,
                last_name,
                dni,
                dni_type,
                email,
                phone_number,
                country_code,
                account_bank_name,
                account_number,
                account_type,
                currency_code,
                beneficiary_status,
                compliance_status,
                created_date
            FROM beneficiary.beneficiary
            WHERE customer_id = {cid}
            ORDER BY created_date DESC
        """,
        "type": "table"
    },
}

def get_connection():
    return mysql.connector.connect(**DB_CONFIG)

def resolve_customer_id(identifier: str):
    identifier = identifier.strip()
    conn = get_connection()
    cursor = conn.cursor()
    try:
        if "@" in identifier:
            cursor.execute(
                "SELECT customer_id FROM customer.customer_v2 WHERE email = %s LIMIT 1",
                (identifier,)
            )
        else:
            try:
                return int(identifier)
            except ValueError:
                cursor.execute(
                    "SELECT customer_id FROM customer.customer_v2 WHERE email = %s LIMIT 1",
                    (identifier,)
                )
        row = cursor.fetchone()
        return row[0] if row else None
    finally:
        cursor.close()
        conn.close()

def search_customers(identifier: str, limit: int = 10):
    identifier = identifier.strip()
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if identifier.isdigit():
            cursor.execute(
                "SELECT customer_id, name, last_name, email FROM customer.customer_v2 "
                "WHERE customer_id = %s LIMIT %s",
                (int(identifier), limit)
            )
        else:
            cursor.execute(
                "SELECT customer_id, name, last_name, email FROM customer.customer_v2 "
                "WHERE email LIKE %s ORDER BY customer_id DESC LIMIT %s",
                (f"%{identifier}%", limit)
            )
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

def fetch_section_data(section_key: str, identifier: str, days: int = 5):
    section = SECTIONS[section_key]
    cid = resolve_customer_id(identifier)
    if cid is None:
        return {"error": "Cliente no encontrado"}

    if "{filter}" in section["query"]:
        where = f"customer_id = {cid}"
        query = section["query"].replace("{filter}", where)
    else:
        query = section["query"].replace("{cid}", str(cid)).replace("{days}", str(int(days)))

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(query)
        rows = cursor.fetchall()
        return rows
    except mysql.connector.Error as e:
        return {"error": str(e)}
    finally:
        cursor.close()
        conn.close()

def generate_pdf(identifier: str, selected_sections: list, transaction_days: int = 5):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Heading1"],
        fontSize=16,
        textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#16213e"),
        spaceBefore=14,
        spaceAfter=6,
        fontName="Helvetica-Bold",
        borderPad=4,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=9,
        textColor=colors.HexColor("#666666"),
        fontName="Helvetica",
    )
    value_style = ParagraphStyle(
        "Value",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#111111"),
        fontName="Helvetica-Bold",
        spaceAfter=6,
    )
    normal_style = styles["Normal"]
    normal_style.fontSize = 9

    story = []

    # --- Header con logo ---
    header_data = []
    if os.path.exists(LOGO_PATH):
        logo = Image(LOGO_PATH, width=1.6 * inch, height=0.6 * inch)
        logo.hAlign = "LEFT"
        header_data.append(logo)
    else:
        header_data.append(Paragraph("Global66", title_style))

    header_table = Table([[header_data[0], Paragraph(
        f"<font color='#888888' size='8'>Reporte de Cliente&nbsp;&nbsp;|&nbsp;&nbsp;{__import__('datetime').date.today().strftime('%d/%m/%Y')}</font>",
        ParagraphStyle("right", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=8)
    )]], colWidths=[3 * inch, 4.25 * inch])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0066cc"), spaceAfter=12))
    story.append(Paragraph(f"Reporte de Cliente: {identifier}", title_style))
    story.append(Spacer(1, 6))

    for section_key in selected_sections:
        if section_key not in SECTIONS:
            continue
        section = SECTIONS[section_key]
        rows = fetch_section_data(section_key, identifier, days=transaction_days)

        section_title = section["label"]
        if section_key == "transacciones":
            section_title = f"Transacciones (últimos {transaction_days} días)"
        story.append(Paragraph(section_title, heading_style))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc"), spaceAfter=6))

        if isinstance(rows, dict) and "error" in rows:
            story.append(Paragraph(f"Error: {rows['error']}", normal_style))
            continue

        if not rows:
            story.append(Paragraph("Sin datos disponibles.", label_style))
            story.append(Spacer(1, 6))
            continue

        if section["type"] == "single" and rows:
            row = rows[0]
            kv_data = []
            for key, val in row.items():
                kv_data.append([
                    Paragraph(key.replace("_", " ").upper(), label_style),
                    Paragraph(str(val) if val is not None else "-", value_style),
                ])
            kv_table = Table(kv_data, colWidths=[2 * inch, 5.25 * inch])
            kv_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f5f7fa")),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#dddddd")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8f9fb")]),
            ]))
            story.append(kv_table)

        elif section["type"] == "table" and rows:
            headers = list(rows[0].keys())
            col_count = len(headers)
            available_width = 7.25 * inch
            font_size = 8 if col_count <= 5 else (7 if col_count <= 8 else 6)

            th_style = ParagraphStyle(
                f"th_{section_key}", parent=styles["Normal"],
                fontSize=font_size, textColor=colors.white,
                fontName="Helvetica-Bold", leading=font_size + 3,
            )
            td_style = ParagraphStyle(
                f"td_{section_key}", parent=styles["Normal"],
                fontSize=font_size, textColor=colors.HexColor("#111111"),
                fontName="Helvetica", leading=font_size + 3,
            )

            def breakable(text):
                return str(text).replace("_", " ").replace("/", "/ ")

            from reportlab.pdfbase.pdfmetrics import stringWidth
            CELL_PAD = 10

            def max_word_width(text, bold=False):
                font = "Helvetica-Bold" if bold else "Helvetica"
                words = str(text).replace("_", " ").replace("/", " ").split()
                return max((stringWidth(w, font, font_size) for w in words), default=stringWidth("-", font, font_size))

            col_min_viable = []
            col_natural    = []

            for h in headers:
                header_text = h.replace("_", " ").upper()
                min_w = max_word_width(header_text, bold=True) + CELL_PAD
                nat_w = stringWidth(header_text, "Helvetica-Bold", font_size) + CELL_PAD

                for r in rows[:40]:
                    val = str(r[h]) if r[h] is not None else "-"
                    bval = breakable(val)
                    min_w = max(min_w, max_word_width(bval) + CELL_PAD)
                    nat_w = max(nat_w, stringWidth(bval[:40], "Helvetica", font_size) + CELL_PAD)

                col_min_viable.append(min_w)
                col_natural.append(nat_w)

            sum_min = sum(col_min_viable)
            sum_nat = sum(col_natural)

            if sum_nat <= available_width:
                extra = available_width - sum_nat
                col_widths = [n + extra * (n / sum_nat) for n in col_natural]
            elif sum_min <= available_width:
                extra = available_width - sum_min
                col_widths = [m + extra * (m / sum_min) for m in col_min_viable]
            else:
                scale = available_width / sum_min
                col_widths = [m * scale for m in col_min_viable]

            table_data = [[Paragraph(h.replace("_", " ").upper(), th_style) for h in headers]]
            for r in rows:
                table_data.append([
                    Paragraph(breakable(r[h]) if r[h] is not None else "-", td_style)
                    for h in headers
                ])

            tbl = Table(table_data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0066cc")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cccccc")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#eef3fb")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(tbl)

        story.append(Spacer(1, 8))

    # Footer
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Paragraph(
        "<font color='#aaaaaa' size='7'>Documento generado por Global66 - Uso interno y confidencial</font>",
        ParagraphStyle("footer", parent=styles["Normal"], alignment=TA_CENTER, fontSize=7)
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer


# --- Routes ---

@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify([])
    try:
        results = search_customers(q)
        return jsonify(results)
    except Exception as e:
        logging.exception("Search error")
        return jsonify({"error": str(e)}), 500

@app.route("/api/sections")
def api_sections():
    return jsonify({k: v["label"] for k, v in SECTIONS.items()})

@app.route("/api/download_pdf", methods=["POST"])
def api_download_pdf():
    data = request.get_json()
    identifier = data.get("identifier", "").strip()
    selected   = data.get("sections", [])

    if not identifier:
        return jsonify({"error": "Debe ingresar un customer_id o email"}), 400
    if not selected:
        return jsonify({"error": "Debe seleccionar al menos una seccion"}), 400

    try:
        transaction_days = int(data.get("transaction_days", 5))
        pdf_buffer = generate_pdf(identifier, selected, transaction_days=transaction_days)
        safe_id = identifier.replace("@", "_at_").replace(".", "_")
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"cliente_{safe_id}.pdf"
        )
    except Exception as e:
        logging.exception("PDF generation error")
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(debug=False, port=port, host="0.0.0.0")
