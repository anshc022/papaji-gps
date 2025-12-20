// Change this to your production URL when deploying
const ENV = {
  dev: {
    API_URL: 'http://192.168.1.5:3000', // Your local IP
  },
  prod: {
    API_URL: 'https://papa-gps-backend.vercel.app', // Example production URL
  }
};

// Set this to 'dev' or 'prod'
const CURRENT_ENV = 'dev';

export default {
  API_URL: ENV[CURRENT_ENV].API_URL,
};
