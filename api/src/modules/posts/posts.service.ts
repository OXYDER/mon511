import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { formatDisplayName } from '../../common/display-name.util';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class PostsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  private friendIdsSubquery(userId: string) {
    return this.db
      .selectFrom('friendships')
      .select(sql<string>`CASE WHEN requester_id = ${userId} THEN addressee_id ELSE requester_id END`.as('friend_id'))
      .where('status', '=', 'accepted')
      .where((eb) => eb.or([eb('requester_id', '=', userId), eb('addressee_id', '=', userId)]));
  }

  private async enrichPosts(rows: any[], viewerId: string) {
    if (rows.length === 0) return [];
    const postIds = rows.map((r) => r.id);

    const [media, reactions, commentCounts] = await Promise.all([
      this.db.selectFrom('post_media').select(['id', 'post_id', 'url', 'media_type', 'order_index']).where('post_id', 'in', postIds).orderBy('order_index', 'asc').execute(),
      this.db.selectFrom('post_reactions').select(['post_id', 'user_id', 'emoji']).where('post_id', 'in', postIds).execute(),
      this.db.selectFrom('post_comments').select(['post_id', sql<number>`count(*)`.as('count')]).where('post_id', 'in', postIds).groupBy('post_id').execute(),
    ]);

    return rows.map((r) => ({
      ...r,
      authorDisplayName: formatDisplayName(r.authorFirstName, r.authorLastName, r.authorPrivacySettings?.last_name_display, r.authorEmail),
      media: media.filter((m) => m.post_id === r.id),
      reactions: reactions.filter((re) => re.post_id === r.id),
      commentCount: Number(commentCounts.find((c) => c.post_id === r.id)?.count ?? 0),
      isMine: r.author_id === viewerId,
    }));
  }

  async findFeed(viewerId: string, category?: string) {
    let query = this.db
      .selectFrom('posts')
      .innerJoin('users', 'users.id', 'posts.author_id')
      .leftJoin('reports', 'reports.id', 'posts.report_id')
      .leftJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'posts.id', 'posts.author_id', 'posts.category', 'posts.body', 'posts.link_url as linkUrl',
        'posts.visibility', 'posts.created_at', 'posts.report_id as reportId',
        'users.avatar_url as authorAvatarUrl', 'users.email as authorEmail',
        'users.first_name as authorFirstName', 'users.last_name as authorLastName',
        'users.privacy_settings as authorPrivacySettings',
        'reports.status as reportStatus', 'reports.address_text as reportAddressText',
        'problem_types.name_fr as reportProblemTypeNameFr', 'problem_types.name_en as reportProblemTypeNameEn',
        'problem_types.icon as reportProblemTypeIcon',
      ])
      .where('posts.status', '=', 'published')
      .where((eb) => eb.or([
        eb('posts.visibility', '=', 'public'),
        eb('posts.author_id', '=', viewerId),
        eb('posts.author_id', 'in', this.friendIdsSubquery(viewerId)),
      ]))
      .orderBy('posts.created_at', 'desc')
      .limit(60);

    if (category) query = query.where('posts.category', '=', category as any);

    const rows = await query.execute();
    return this.enrichPosts(rows, viewerId);
  }

  async findMyPosts(userId: string) {
    const rows = await this.db
      .selectFrom('posts')
      .innerJoin('users', 'users.id', 'posts.author_id')
      .select([
        'posts.id', 'posts.author_id', 'posts.category', 'posts.body', 'posts.link_url as linkUrl',
        'posts.visibility', 'posts.status', 'posts.rejection_reason as rejectionReason', 'posts.created_at', 'posts.report_id as reportId',
        'users.avatar_url as authorAvatarUrl', 'users.email as authorEmail',
        'users.first_name as authorFirstName', 'users.last_name as authorLastName',
        'users.privacy_settings as authorPrivacySettings',
      ])
      .where('posts.author_id', '=', userId)
      .orderBy('posts.created_at', 'desc')
      .execute();
    return this.enrichPosts(rows, userId);
  }

  async createPost(authorId: string, dto: CreatePostDto) {
    if (dto.reportId) {
      const report = await this.db.selectFrom('reports').select('user_id').where('id', '=', dto.reportId).executeTakeFirst();
      if (!report) throw new NotFoundException('Signalement introuvable.');
      if (report.user_id !== authorId) throw new ForbiddenException("Tu ne peux partager que tes propres signalements.");
    }

    const requireModeration = await this.db.selectFrom('site_settings').select('value').where('key', '=', 'require_moderation').executeTakeFirst();
    const status = requireModeration?.value === false ? 'published' : 'pending_moderation';

    return this.db
      .insertInto('posts')
      .values({
        author_id: authorId,
        report_id: dto.reportId ?? null,
        category: dto.category,
        body: dto.body ?? null,
        link_url: dto.linkUrl ?? null,
        visibility: dto.visibility,
        status,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async addMedia(postId: string, authorId: string, url: string, mediaType: 'photo' | 'video', orderIndex: number) {
    const post = await this.db.selectFrom('posts').select('author_id').where('id', '=', postId).executeTakeFirst();
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.author_id !== authorId) throw new ForbiddenException();

    return this.db
      .insertInto('post_media')
      .values({ post_id: postId, url, media_type: mediaType, order_index: orderIndex })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deletePost(postId: string, userId: string, isModerator: boolean) {
    const post = await this.db.selectFrom('posts').select('author_id').where('id', '=', postId).executeTakeFirst();
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.author_id !== userId && !isModerator) throw new ForbiddenException();
    await this.db.deleteFrom('posts').where('id', '=', postId).execute();
    return { deleted: true };
  }

  async findComments(postId: string) {
    const rows = await this.db
      .selectFrom('post_comments')
      .innerJoin('users', 'users.id', 'post_comments.author_id')
      .select([
        'post_comments.id', 'post_comments.body', 'post_comments.created_at', 'post_comments.author_id as authorId',
        'users.avatar_url as authorAvatarUrl', 'users.email as authorEmail',
        'users.first_name as authorFirstName', 'users.last_name as authorLastName',
        'users.privacy_settings as authorPrivacySettings',
      ])
      .where('post_comments.post_id', '=', postId)
      .orderBy('post_comments.created_at', 'asc')
      .execute();

    return rows.map((r) => ({
      ...r,
      authorDisplayName: formatDisplayName(r.authorFirstName, r.authorLastName, (r.authorPrivacySettings as any)?.last_name_display, r.authorEmail),
    }));
  }

  async addComment(postId: string, authorId: string, body: string) {
    const post = await this.db.selectFrom('posts').select('id').where('id', '=', postId).where('status', '=', 'published').executeTakeFirst();
    if (!post) throw new NotFoundException('Publication introuvable.');

    return this.db.insertInto('post_comments').values({ post_id: postId, author_id: authorId, body }).returningAll().executeTakeFirstOrThrow();
  }

  async toggleReaction(postId: string, userId: string, emoji: string) {
    const existing = await this.db
      .selectFrom('post_reactions')
      .select('id')
      .where('post_id', '=', postId)
      .where('user_id', '=', userId)
      .where('emoji', '=', emoji)
      .executeTakeFirst();

    if (existing) {
      await this.db.deleteFrom('post_reactions').where('id', '=', existing.id).execute();
      return { added: false };
    }
    await this.db.insertInto('post_reactions').values({ post_id: postId, user_id: userId, emoji }).execute();
    return { added: true };
  }

  async findModerationQueue() {
    const rows = await this.db
      .selectFrom('posts')
      .innerJoin('users', 'users.id', 'posts.author_id')
      .select([
        'posts.id', 'posts.category', 'posts.body', 'posts.link_url as linkUrl', 'posts.visibility', 'posts.created_at',
        'users.avatar_url as authorAvatarUrl', 'users.email as authorEmail',
        'users.first_name as authorFirstName', 'users.last_name as authorLastName',
        'users.privacy_settings as authorPrivacySettings',
      ])
      .where('posts.status', '=', 'pending_moderation')
      .orderBy('posts.created_at', 'asc')
      .execute();
    return this.enrichPosts(rows, '');
  }

  async approvePost(postId: string) {
    await this.db.updateTable('posts').set({ status: 'published', updated_at: new Date() as any }).where('id', '=', postId).execute();
    return { approved: true };
  }

  async rejectPost(postId: string, reason?: string) {
    await this.db.updateTable('posts').set({ status: 'rejected', rejection_reason: reason ?? null, updated_at: new Date() as any }).where('id', '=', postId).execute();
    return { rejected: true };
  }
}
