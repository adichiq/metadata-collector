const pg = require('pg');
const process = require('process');
const connectionParser = require('connection-string-parser');
const fs = require('fs');
const yaml = require('js-yaml');

require('dotenv').config();

const { setup } = require('./setup');
const { QUERIES_FILE } = require('./consts');
const { logger } = require('./logging');
const { processResults } = require('./process');
const { getConnectionStrings } = require('./secret');

const DB_CONNECT_TIMEOUT = 5000;

const queriesFileContents = fs.readFileSync(QUERIES_FILE, 'utf8');
const QUERIES = yaml.load(queriesFileContents);
const IGNORE_CURRENT_TIME = process.env.IGNORE_CURRENT_TIME === 'true';

let DB_CONNECTION_STRINGS = null;

async function getDBConfigs() {
  const connectionStringParser = new connectionParser.ConnectionStringParser({
    scheme: 'postgresql',
    hosts: [],
  });
  const configs = DB_CONNECTION_STRINGS.split(';').filter(Boolean).map((dbConnectionString) => {
    const dbConnectionObject = connectionStringParser.parse(dbConnectionString);
    const condition = dbConnectionObject && dbConnectionObject.hosts && dbConnectionObject.hosts[0];
    const host = condition ? dbConnectionObject.hosts[0].host : undefined;
    const port = condition ? dbConnectionObject.hosts[0].port : undefined;
    return {
      user: dbConnectionObject.username || dbConnectionObject.options.user,
      password: dbConnectionObject.password || dbConnectionObject.options.password,
      database: dbConnectionObject.endpoint,
      host,
      port: port || 5432,
      connectionTimeoutMillis: DB_CONNECT_TIMEOUT,
    };
  });
  return configs;
}

function relevant(timesADay, hour, minutes) {
  const floatTimesADay = parseFloat(timesADay);
  if (!floatTimesADay || floatTimesADay < 0) {
    return false;
  }
  const every = Math.round(24 / floatTimesADay);
  return hour % every === 0 || (minutes === 0 && ((hour + 23) % 24) % every === 0);
}

function getQueries() {
  const now = new Date();
  const currentMinutes = now.getMinutes();
  const currentHour = IGNORE_CURRENT_TIME ? 0 : new Date().getHours();
  if (process.argv.length === 2) {
    return Object.keys(QUERIES)
      .filter((key) => relevant(QUERIES[key].times_a_day, currentHour, currentMinutes))
      .map((key) => QUERIES[key].query);
  }
  const qs = [];
  process.argv.slice(2).forEach((q) => { if (q in QUERIES) { qs.push(QUERIES[q].query); } });
  if (qs.length < process.argv.length - 2) {
    const nonEligableQueries = process.argv.slice(2).filter((q) => !(q in QUERIES));
    throw Error(`Error running the CLI. The following are not eligible queries: ${nonEligableQueries}`);
  }
  return qs;
}

async function collect() {
  const dbConfigs = await getDBConfigs();
  if (dbConfigs.length === 0) {
    logger.error('No connection strings could be parsed');
    return;
  }
  const theQueries = getQueries();
  if (theQueries.length === 0) {
    logger.info('There are no queries to run for this hour.');
    return;
  }
  const bigQuery = theQueries.join('; ');
  await Promise.allSettled(
    dbConfigs.map(
      async (dbConfig) => {
        let client = null;
        try {
          client = new pg.Client(dbConfig);
          logger.info(`Trying to connect to ${dbConfig.database} ...`);
          await client.connect();
          logger.info(`Connected to ${dbConfig.database}`);
          const res = await client.query(bigQuery);
          logger.info('Obtained query results. Processing results ...');
          await processResults(theQueries, dbConfig, res);
          logger.info('Processing results done.');
        } catch (err) {
          logger.error(err.message, false, err.context);
        } finally {
          if (client) {
            client.end();
          }
        }
      },
    ),
  ).then((results) => {
    const allOK = results.every((result) => result.status === 'fulfilled');
    if (!allOK) {
      logger.error(`Some of the DBs did not get back fine. dbConfigs is: ${dbConfigs} and the results are ${results}`);
    }
  }).catch((err) => {
    logger.err(`Error "${err}" catched in collect.`);
  });
  logger.info('Collection is done.');
}

async function run() {
  const ok = await setup();
  if (!ok) {
    return;
  }

  try {
    DB_CONNECTION_STRINGS = await getConnectionStrings();
  } catch (err) {
    logger.error('No connection strings found. Exiting...');
    process.exit(1);
  }

  collect();
}

run().then(() => {}).catch((err) => { logger.error(err.message); });
