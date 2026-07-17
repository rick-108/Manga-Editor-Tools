import { Router, type IRouter } from "express";
import healthRouter from "./health";
import mangaRouter from "./manga";
import chaptersRouter from "./chapters";
import pagesRouter from "./pages";
import publisherRouter from "./publisher";
import remoteRouter from "./remote";
import authRouter from "./auth";
import commentsRouter from "./comments";
import imgRouter from "./img";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mangaRouter);
router.use(chaptersRouter);
router.use(pagesRouter);
router.use(publisherRouter);
router.use(remoteRouter);
router.use(authRouter);
router.use(commentsRouter);
router.use(imgRouter);

export default router;
