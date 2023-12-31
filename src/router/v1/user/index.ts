import { Request, Response } from "express";
import { v1 } from "@common-jshs/menkakusitsu-lib";
import V1 from "..";
import { HttpException, ResponseException } from "common-api-ts";
import { execute, query } from "common-api-ts";
import { sendPush } from "../../../firebase";
import { aes256Decrypt, aes256Encrypt, getJwtPayload } from "../../../utils";
import { sendPushToUser } from "../../../utils/Api";
import { sanitizeRequest } from "../../../utils/Sanitizer";

class User extends V1 {
    constructor() {
        super();
        this.setPath("/user");
        this.models = [
            {
                method: "post",
                path: "/push",
                authType: "access",
                controller: this.onPostPush,
            },
            {
                method: "put",
                path: "/push",
                authType: "access",
                controller: this.onPutPush,
            },
            {
                method: "delete",
                path: "/push",
                authType: "access",
                controller: this.onDeletePush,
            },
            {
                method: "get",
                path: "/me",
                authType: "access",
                controller: this.onGetMyPrivateInfo,
            },
            {
                method: "put",
                path: "/me/email",
                authType: "access",
                controller: this.onPutEmail,
            },
            {
                method: "put",
                path: "/me/password",
                authType: "access",
                controller: this.onPutPassword,
            },
        ];
    }

    async onPostPush(req: Request, res: Response) {
        const request: v1.PostPushRequest = req.body;
        if (!sanitizeRequest(request, "PostPushRequest")) {
            throw new HttpException(400);
        }

        sendPushToUser(
            request.targetUid,
            request.notification.title,
            request.notification.body,
            request.notification.link
        );
        const postPushResponse: v1.PostPushResponse = {
            status: 0,
            message: "",
        };
        res.status(200).json(postPushResponse);
    }

    async onPutPush(req: Request, res: Response) {
        const request: v1.PutPushRequest = req.body;
        if (!sanitizeRequest(request, "PutPushRequest")) {
            throw new HttpException(400);
        }

        const payload = getJwtPayload(req.headers.authorization!);
        const cnt = (
            await query(
                "SELECT COUNT(*) AS cnt FROM push_token WHERE uid=? AND deviceId=?",
                [payload.uid, request.deviceId]
            )
        )[0].cnt;
        if (cnt === 0) {
            await execute(
                "INSERT INTO push_token(uid, token, deviceId, createdDate) VALUE(?, ?, ?, NOW())",
                [payload.uid, request.pushToken, request.deviceId]
            );
        } else {
            await execute(
                "UPDATE push_token SET token=? WHERE uid=? AND deviceId=?",
                [payload.uid, request.deviceId]
            );
        }
        const putPushResponse: v1.PutPushResponse = {
            status: 0,
            message: "",
        };
        res.status(200).json(putPushResponse);
    }

    async onDeletePush(req: Request, res: Response) {
        const request: v1.DeletePushRequest = req.body;
        if (!sanitizeRequest(request, "DeletePushRequest")) {
            throw new HttpException(400);
        }

        const payload = getJwtPayload(req.headers.authorization!);
        execute("DELETE FROM push_token WHERE uid=? AND deviceId=?", [
            payload.uid,
            request.devcieId,
        ]);
        const deletePushResponse: v1.DeletePushResponse = {
            status: 0,
            message: "",
        };
        res.status(200).json(deletePushResponse);
    }

    async onGetMyPrivateInfo(req: Request, res: Response) {
        const request: v1.GetMyPrivateInfoRequest = req.query as any;
        if (!sanitizeRequest(request, "GetMyPrivateInfoRequest")) {
            throw new HttpException(400);
        }

        const payload = getJwtPayload(req.headers.authorization!);
        const getUserInfoQuery = await query("SELECT * FROM user WHERE uid=?", [
            payload.uid,
        ]);
        if (!getUserInfoQuery || getUserInfoQuery.length === 0) {
            throw new HttpException(500);
        }
        const userInfo = getUserInfoQuery[0];
        const response: v1.GetMyPrivateInfoResponse = {
            status: 0,
            message: "",
            private: {
                email: /*aes256Decrypt*/ userInfo.email,
            },
        };
        res.status(200).json(response);
    }

    async onPutEmail(req: Request, res: Response) {
        const request: v1.PutEmailRequest = req.body;
        if (!sanitizeRequest(request, "PutEmailRequest")) {
            throw new HttpException(400);
        }

        const payload = getJwtPayload(req.headers.authorization!);
        const getUserInfoQuery = await query("SELECT * FROM user WHERE uid=?", [
            payload.uid,
        ]);
        if (!getUserInfoQuery || getUserInfoQuery.length === 0) {
            throw new HttpException(500);
        }

        // request.oldEmail = aes256Encrypt(request.oldEmail);
        // request.newEmail = aes256Encrypt(request.newEmail);

        const userInfo = getUserInfoQuery[0];
        if (request.oldEmail != userInfo.email) {
            throw new ResponseException(
                -1,
                "이전 이메일을 알맞게 입력하지 않았습니다."
            );
        }
        const getEmailCntQuery = await query(
            "SELECT COUNT(*) as cnt FROM user WHERE email=?",
            [request.newEmail]
        );
        if (Number(getEmailCntQuery[0].cnt!) > 0) {
            throw new ResponseException(
                -2,
                "다른 사람이 사용 중인 이메일입니다."
            );
        }
        await execute("UPDATE user SET email=? WHERE uid=?", [
            request.newEmail,
            payload.uid,
        ]);
        const response: v1.PutEmailResponse = {
            status: 0,
            message: "",
            newEmail: request.newEmail,
        };
        res.status(200).json(response);
    }

    async onPutPassword(req: Request, res: Response) {
        const request: v1.PutPasswordRequest = req.body;
        if (!sanitizeRequest(request, "PutPasswordRequest")) {
            throw new HttpException(400);
        }

        const payload = getJwtPayload(req.headers.authorization!);
        const getUserInfoQuery = await query("SELECT * FROM user WHERE uid=?", [
            payload.uid,
        ]);
        if (!getUserInfoQuery || getUserInfoQuery.length === 0) {
            throw new HttpException(500);
        }

        // request.oldPassword = aes256Encrypt(request.oldPassword);
        // request.newPassword = aes256Encrypt(request.newPassword);

        const userInfo = getUserInfoQuery[0];
        if (request.oldPassword != userInfo.password) {
            throw new ResponseException(
                -1,
                "이전 비밀번호를 알맞게 입력하지 않았습니다."
            );
        }
        await execute("UPDATE user SET password=? WHERE uid=?", [
            request.newPassword,
            payload.uid,
        ]);
        const response: v1.PutEmailResponse = {
            status: 0,
            message: "",
            newEmail: request.newPassword,
        };
        res.status(200).json(response);
    }
}

export default User;
