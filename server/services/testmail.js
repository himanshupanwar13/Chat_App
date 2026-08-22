const https = require('https');

function queryInbox({ tag = '', limit = 10, livequery = false }) {
  const apiKey = process.env.TESTMAIL_APIKEY;
  const namespace = process.env.TESTMAIL_NAMESPACE;

  if (!apiKey || !namespace) {
    return Promise.reject(new Error('Testmail configuration is missing.'));
  }

  const params = new URLSearchParams({
    apikey: apiKey,
    namespace,
    limit: String(limit),
    pretty: 'false',
  });

  if (tag) {
    params.set('tag', tag);
  }

  if (livequery) {
    params.set('livequery', 'true');
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.testmail.app',
        port: 443,
        path: `/api/json?${params.toString()}`,
        method: 'GET',
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(responseBody);
              resolve(parsed);
            } catch (error) {
              reject(new Error('Failed to parse Testmail inbox response.'));
            }
            return;
          }

          reject(
            new Error(
              `Testmail query failed with status ${res.statusCode}: ${responseBody}`
            )
          );
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  queryInbox,
};
