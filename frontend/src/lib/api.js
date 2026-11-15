import axios from "axios";
import { finishPageRequest, trackPageRequest } from "./page-request-tracker.js";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  trackPageRequest(config);
  return config;
});

api.interceptors.response.use(
  (response) => {
    finishPageRequest(response.config);
    return response;
  },
  (error) => {
    finishPageRequest(error.config);
    return Promise.reject(error);
  },
);
