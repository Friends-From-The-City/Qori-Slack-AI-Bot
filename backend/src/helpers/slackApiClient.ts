// utils/slackApiClient.ts
import axios, { type AxiosInstance } from 'axios';

const slackApiClient: AxiosInstance = axios.create({
  baseURL: 'https://slack.com/api/',
  headers: {
    Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export default slackApiClient;
