import { Router } from "../lib/router.js";
import { getHealth } from "../controllers/health.controller.js";

const healthRouter = Router();

healthRouter.get("/", getHealth);

export default healthRouter;
