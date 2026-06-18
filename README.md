# Lobster Accounting

WeChat mini program and Koa API for lobster transaction accounting.

## Structure

```text
miniprogram/
  app.js, app.json, app.wxss
  pages/                 Mini program pages
  utils/                 Request, auth, config, formatting helpers
  assets/                Tab bar icons and static assets

server/
  src/
    app.js               Koa application entry
    config/              Environment and database configuration
    controllers/         HTTP request validation and response handling
    middlewares/         Auth and error handling
    models/              Sequelize models and associations
    routes/              API route declarations
    serializers/         API response shaping
    services/            Business logic and persistence
    utils/               Shared server helpers
```

## Server

```bash
cd server
npm install
npm run dev
```

Available scripts:

- `npm start`: run `src/app.js`
- `npm run dev`: run with nodemon
- `npm run sync`: recreate database tables with `sequelize.sync({ force: true })`

## Notes

- Configure server environment variables with `server/.env`; use `server/.env.example` as the template.
- Do not commit generated dependencies, logs, or local mini program private config.
- Keep controllers thin: validate request input, call services, and format HTTP status.
- Keep service return shapes in `server/src/serializers` so API response fields remain consistent.
