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
import libraryRouter from "./library";
import progressRouter from "./progress";
import profileRouter from "./profile";
import xpRouter from "./xp";

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
router.use(libraryRouter);
router.use(progressRouter);
router.use(profileRouter);
router.use(xpRouter);

export default router;
