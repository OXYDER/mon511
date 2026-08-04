import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class CommentsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  async findForReport(reportId: string) {
    return this.db
      .selectFrom('report_comments')
      .innerJoin('users', 'users.id', 'report_comments.user_id')
      .select([
        'report_comments.id', 'report_comments.message', 'report_comments.parent_comment_id',
        'report_comments.created_at', 'users.id as authorId', 'users.email as authorEmail',
      ])
      .where('report_comments.report_id', '=', reportId)
      .where('report_comments.status', '=', 'visible')
      .orderBy('report_comments.created_at', 'asc')
      .execute();
  }

  async create(reportId: string, userId: string, message: string, parentCommentId?: string) {
    return this.db
      .insertInto('report_comments')
      .values({
        report_id: reportId,
        user_id: userId,
        parent_comment_id: parentCommentId ?? null,
        message,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Masquage par un modérateur — pas de suppression physique, pour traçabilité (§13). */
  async hide(commentId: string) {
    return this.db
      .updateTable('report_comments')
      .set({ status: 'hidden' })
      .where('id', '=', commentId)
      .execute();
  }
}
