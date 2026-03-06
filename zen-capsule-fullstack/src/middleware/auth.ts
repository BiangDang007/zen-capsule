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
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })
})
