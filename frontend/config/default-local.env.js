const ENV = ENV_LOCAL;

if (ENV === "local") {
  MS_SANCTUM_API_URL = `http://localhost:7002`;
}
