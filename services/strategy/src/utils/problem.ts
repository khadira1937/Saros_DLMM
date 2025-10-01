import type { FastifyReply } from 'fastify';

export type ProblemDetail = {
  type?: string;
  title: string;
  status: number;
  detail?: string | undefined;
  code?: string | undefined;
};

export const defaultProblemType = 'https://datatracker.ietf.org/doc/html/rfc7807';

export const sendProblem = (
  reply: FastifyReply,
  problem: ProblemDetail,
): FastifyReply =>
  reply
    .code(problem.status)
    .type('application/problem+json')
    .send({
      type: problem.type ?? defaultProblemType,
      title: problem.title,
      status: problem.status,
      ...(problem.detail ? { detail: problem.detail } : {}),
      ...(problem.code ? { code: problem.code } : {}),
    });
