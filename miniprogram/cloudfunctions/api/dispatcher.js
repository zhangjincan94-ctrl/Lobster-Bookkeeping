// 云函数环境变量建议：DB_POOL_MAX=3、DB_ACQUIRE_MS=5000。
// 云函数实例多且并发低，连接池需要收敛，避免耗尽数据库连接。
const errorHandler = require('./src/middlewares/errorHandler')();

let router = null;
let configError = null;
try {
  const { assertConfig } = require('./src/config');
  assertConfig();
  // 配置校验通过后再加载路由，避免模块初始化异常直接吞掉可读错误。
  router = require('./src/routes');
} catch (err) {
  configError = err;
  console.error('[云函数启动配置校验失败]', { reason: err.message });
}

function compose(middleware) {
  return function (ctx, next) {
    let index = -1;

    function dispatch(i) {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;
      const fn = i === middleware.length ? next : middleware[i];
      if (!fn) return Promise.resolve();
      try {
        return Promise.resolve(fn(ctx, dispatch.bind(null, i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}

const routeDispatch = router ? router.routes() : null;
const CONFIG_ERROR_MESSAGE = configError && String(configError.message).startsWith('服务配置缺失')
  ? configError.message
  : '服务配置加载失败，请检查云函数部署包与环境变量';

// 部署顺序不固定（先上传代码、后跑迁移）时也要能自愈，避免新字段直接打成 500。
// 每个实例只检查一次，失败后下次请求重试。
let schemaReady = null;
function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    try {
      const { sequelize } = require('./src/models');
      const [rows] = await sequelize.query(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS "
        + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchants' AND COLUMN_NAME = 'avatar'"
      );
      if (Number(rows[0].count) === 0) {
        await sequelize.query('ALTER TABLE merchants ADD COLUMN avatar MEDIUMTEXT NULL AFTER phone');
        console.log('[云函数启动] 已补建 merchants.avatar 列');
      }
    } catch (err) {
      console.error('[云函数启动] 检查数据库结构失败', { reason: err.message });
      schemaReady = null;
    }
  })();
  return schemaReady;
}

const runMiddleware = compose([
  errorHandler,
  async function (ctx, next) {
    if (!routeDispatch) {
      ctx.status = 200;
      ctx.body = {
        code: 500,
        message: CONFIG_ERROR_MESSAGE,
        data: null
      };
      return;
    }
    await ensureSchema();
    return routeDispatch(ctx, next);
  }
]);

function normalizeHeaders(headers) {
  const result = {};
  Object.keys(headers || {}).forEach(function (key) {
    const value = headers[key];
    if (value === undefined || value === null) return;
    result[String(key).toLowerCase()] = String(value);
  });
  return result;
}

// HTTP 查询串里的值一律是字符串，这里保持同样的语义，避免服务层出现类型差异。
function normalizeQuery(data) {
  const result = {};
  Object.keys(data || {}).forEach(function (key) {
    const value = data[key];
    if (value === undefined || value === null) return;
    result[key] = Array.isArray(value) ? value.map(String) : String(value);
  });
  return result;
}

function createContext(options) {
  const header = options.header;
  const state = {};
  const request = {
    method: options.method,
    path: options.path,
    body: options.body,
    query: options.query,
    params: {},
    header: header,
    headers: header
  };

  const ctx = {
    method: options.method,
    path: options.path,
    query: options.query,
    header: header,
    headers: header,
    request: request,
    state: state,
    params: {},
    status: 404,
    body: undefined,
    get: function (name) {
      return header[String(name).toLowerCase()] || '';
    },
    throw: function (status, message) {
      const err = new Error(message || '请求失败');
      err.status = status;
      throw err;
    }
  };

  return ctx;
}

async function handle(payload) {
  const method = String((payload && payload.method) || 'GET').toUpperCase();
  const path = String((payload && payload.path) || '/').split('?')[0];
  const header = normalizeHeaders(payload && payload.header);
  const data = (payload && payload.data) || {};

  const isQueryMethod = method === 'GET' || method === 'HEAD' || method === 'DELETE';
  const ctx = createContext({
    method: method,
    path: path,
    header: header,
    query: isQueryMethod ? normalizeQuery(data) : {},
    body: isQueryMethod ? {} : data
  });

  try {
    await runMiddleware(ctx, async function () {});
  } catch (err) {
    // errorHandler 已经兜底，这里只处理极少数漏网异常。
    if (ctx.body === undefined) {
      const status = err.status || 500;
      ctx.status = status;
      ctx.body = {
        code: status,
        message: status >= 500 ? '服务器内部错误' : err.message || '操作失败',
        data: null
      };
    }
  }

  if (ctx.body !== undefined && ctx.status === 404) {
    ctx.status = 200;
  }

  return {
    statusCode: ctx.status,
    data: ctx.body === undefined ? null : ctx.body
  };
}

module.exports = { handle };
