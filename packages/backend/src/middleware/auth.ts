import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export const authMiddleware = fp(async (app: FastifyInstance) => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify()
      // Reject refresh tokens used as access tokens. Refresh tokens are signed
      // with the same secret and carry `sub`, so without this check a 30-day
      // refresh token would work as a bearer credential on every protected route.
      if ((req.user as { type?: string }).type === 'refresh') {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
})
