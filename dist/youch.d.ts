import StackTracey from 'stacktracey';
import { Request } from 'express';

interface SourceCode {
    pre: string[];
    line: string;
    post: string[];
}
interface Context {
    start: number;
    pre: string;
    line: string;
    post: string;
}
declare type Frame = StackTracey.Entry & {
    context?: SourceCode;
};
declare type SerializedFrame = {
    file: string;
    filePath: string;
    line?: number;
    callee: string;
    calleeShort: string;
    column?: number;
    context?: Context;
    isModule: boolean;
    isNative: boolean;
    isApp: boolean;
};
declare type Error = NodeJS.ErrnoException & {
    status?: number;
};
declare class Youch {
    codeContext: number;
    _filterHeaders: string[];
    error: Error;
    request: Request;
    links: any[];
    constructor(error: Error, request: Request);
    _getFrameSource(frame: Frame): Promise<SourceCode | undefined>;
    _parseError(): Promise<(Frame | (Frame & Context | {}))[]>;
    _getContext(frame: Frame): Context | undefined;
    _getDisplayClasses(frame: SerializedFrame, index: number): string;
    _compileView(view: string, data?: Record<string, unknown>): string;
    _serializeFrame(frame: Frame): SerializedFrame;
    _isBuiltIn(frame: Frame): boolean;
    _isApp(frame: Frame): boolean;
    _isNodeModule(frame: Frame): boolean;
    _serializeData(stack: ({} | Frame | (StackTracey.Entry & {
        context?: Context;
    } & Context))[], callback?: (frame: Frame, index: number, array: any[]) => void): {
        message: string;
        name: string;
        status: number | undefined;
        frames: unknown[];
    };
    _serializeRequest(): {
        url: string;
        httpVersion: string;
        method: string;
        connection: string | undefined;
        headers: {
            key: string;
            value: string | string[] | undefined;
        }[];
        cookies: {
            key: string;
            value: string;
        }[];
    };
    addLink(callback: () => void): this;
    toJSON(): Promise<{
        error: {
            message: string;
            name: string;
            status: number | undefined;
            frames: unknown[];
        };
    }>;
    toHTML(): Promise<string>;
}

export { Youch };
