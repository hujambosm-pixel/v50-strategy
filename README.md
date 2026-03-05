# V50 — Estrategia Cruce EMAs

App web para analizar la estrategia V50 con datos gratuitos de Yahoo Finance.
Sin Python. Sin instalaciones. Solo subir a Vercel.

---

## Despliegue en Vercel (paso a paso)

### 1. Crear cuenta en GitHub (gratis)
Ve a https://github.com y crea una cuenta si no tienes.

### 2. Crear repositorio
- Pulsa el botón verde "New" en GitHub
- Ponle nombre: `v50-strategy`
- Déjalo en Public
- Pulsa "Create repository"

### 3. Subir los archivos
En la página del repositorio vacío verás un enlace "uploading an existing file".
Sube todos los archivos de esta carpeta manteniendo la estructura de carpetas:
```
v50-web/
  package.json
  next.config.js
  vercel.json
  pages/
    _app.js
    index.js
    api/
      datos.js
  styles/
    globals.css
```

### 4. Conectar con Vercel (gratis)
- Ve a https://vercel.com
- Pulsa "Sign up" → "Continue with GitHub"
- Una vez dentro, pulsa "Add New Project"
- Selecciona el repositorio `v50-strategy`
- Pulsa "Deploy" — sin cambiar nada más

En 2-3 minutos tendrás una URL pública tipo:
`https://v50-strategy-tuusuario.vercel.app`

---

## Qué puede hacer la app

- **Gráfico de velas interactivo** con EMAs, proyecciones y señales
- **Backtest completo** con todas las métricas (CAGR, drawdown, win rate...)
- **Filtro SP500** con estado en tiempo real
- **Cualquier símbolo** de Yahoo Finance: ^GSPC, ^IBEX, AAPL, BTC-USD...
- **Historial de operaciones** con tabla completa

---

## Símbolos útiles

| Activo        | Símbolo   |
|---------------|-----------|
| S&P 500       | `^GSPC`   |
| IBEX 35       | `^IBEX`   |
| DAX           | `^GDAXI`  |
| Nasdaq 100    | `^NDX`    |
| Euro Stoxx 50 | `^STOXX50E` |
| Oro           | `GC=F`    |
| Bitcoin       | `BTC-USD` |
| Apple         | `AAPL`    |
| Microsoft     | `MSFT`    |
