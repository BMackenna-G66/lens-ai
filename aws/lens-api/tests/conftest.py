"""Lo que tiene que valer para TODOS los tests, antes de importar nada.

`extraccion.MOTOR_OCR` se lee una sola vez, al importar el módulo. Hasta el
30-09-2026 lo apagaba `test_app.py` en su primera línea, y alcanzaba solo porque
ese archivo se recolecta antes que los demás: corriendo un test suelto de otro
archivo, el OCR quedaba en `textract` y el test llamaba a AWS de verdad, con las
credenciales de quien lo corriera. Pasó con el test del PDF cifrado — una página
en blanco no tiene capa de texto, así que fue directo a Textract.

Un test no sale a la red. Con esto no depende del orden en que pytest encuentre
los archivos. `setdefault`: si alguien exporta la variable a propósito, gana la
suya.
"""

import os

os.environ.setdefault("MOTOR_OCR", "ninguno")
