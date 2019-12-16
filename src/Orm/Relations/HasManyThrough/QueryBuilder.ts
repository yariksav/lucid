/*
 * @adonisjs/lucid
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

import knex from 'knex'
import { QueryClientContract } from '@ioc:Adonis/Lucid/Database'
import { ModelConstructorContract, ModelContract } from '@ioc:Adonis/Lucid/Model'
import { RelationBaseQueryBuilderContract } from '@ioc:Adonis/Lucid/Relations'

import { HasManyThrough } from './index'
import { getValue, unique } from '../../../utils'
import { BaseQueryBuilder } from '../Base/QueryBuilder'

/**
 * Extends the model query builder for executing queries in scope
 * to the current relationship
 */
export class HasManyThroughQueryBuilder extends BaseQueryBuilder implements RelationBaseQueryBuilderContract<
ModelConstructorContract,
ModelConstructorContract
> {
  constructor (
    builder: knex.QueryBuilder,
    client: QueryClientContract,
    private parent: ModelContract | ModelContract[],
    private relation: HasManyThrough,
  ) {
    super(builder, client, relation, (userFn) => {
      return (__builder) => {
        userFn(new HasManyThroughQueryBuilder(__builder, this.client, this.parent, this.relation))
      }
    })
  }

  /**
   * Adds where constraint to the pivot table
   */
  private addWhereConstraints (builder: HasManyThroughQueryBuilder) {
    const queryAction = this.$queryAction()
    const throughTable = this.relation.$throughModel().$table

    /**
     * Eager query contraints
     */
    if (Array.isArray(this.parent)) {
      builder.whereIn(
        `${throughTable}.${this.relation.$foreignCastAsKey}`,
        unique(this.parent.map((model) => {
          return getValue(model, this.relation.$localKey, this.relation, queryAction)
        })),
      )
      return
    }

    /**
     * Query constraints
     */
    const value = getValue(this.parent, this.relation.$localKey, this.relation, queryAction)
    builder.where(`${throughTable}.${this.relation.$foreignCastAsKey}`, value)
  }

  /**
   * Applies constraint to limit rows to the current relationship
   * only.
   */
  public applyConstraints () {
    if (this.$appliedConstraints) {
      return
    }

    this.$appliedConstraints = true

    const throughTable = this.relation.$throughModel().$table
    const relatedTable = this.relation.$relatedModel().$table

    if (['delete', 'update'].includes(this.$queryAction())) {
      this.whereIn(`${relatedTable}.${this.relation.$throughForeignCastAsKey}`, (subQuery) => {
        subQuery.from(throughTable)
        this.addWhereConstraints(subQuery)
      })
      return
    }

    /**
     * Selecting all from the related table, along with the foreign key of the
     * through table.
     */
    this.select(
      `${relatedTable}.*`,
      `${throughTable}.${this.relation.$foreignCastAsKey} as ${this.relation.throughAlias(this.relation.$foreignCastAsKey)}`,
    )

    /**
     * Inner join
     */
    this.innerJoin(
      throughTable,
      `${throughTable}.${this.relation.$throughLocalCastAsKey}`,
      `${relatedTable}.${this.relation.$throughForeignCastAsKey}`,
    )

    /**
     * Adding where constraints
     */
    this.addWhereConstraints(this)
  }
}
