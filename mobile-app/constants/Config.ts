// Change this to your production URL when deploying
const ENV = {
  dev: {
    API_URL: 'http://3.27.84.253:3000', // AWS Backend
  },
  prod: {
    API_URL: 'http://3.27.84.253:3000', // AWS Backend
  }
};

// Set this to 'dev' or 'prod'
const CURRENT_ENV = 'prod';

export default {
  API_URL: ENV[CURRENT_ENV].API_URL,
};
