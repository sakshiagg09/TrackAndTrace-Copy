const axios = require("axios");

async function callSAPTM(method, url, data = null) {
  return axios({
    method,
    url,
    data,
    headers: {
      "Authorization": `Basic ${process.env.SAP_BASIC}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    validateStatus: () => true // allow 400 responses
  });
}

module.exports = { callSAPTM };
