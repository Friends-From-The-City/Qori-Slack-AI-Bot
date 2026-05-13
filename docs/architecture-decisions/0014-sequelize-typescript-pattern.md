# ADR 0014: Use Sequelize v6 built-in TypeScript generics for model typing

**Status:** Accepted  
**Date:** 2026-05-13  
**Decision drivers:** Phase 2 of the TypeScript migration (ADR 0013) requires choosing how Sequelize models get typed. The choice locks in conventions for all 13 models and affects every service and handler that touches the database. Three patterns were evaluated; this ADR documents the chosen approach.

## Context

The codebase has 13 Sequelize v6 models, all using `Class extends Model` with `Model.init()` factory functions. The TypeScript migration needs to add type safety to model attributes so that:

- Handlers cannot access fields a service didn't return (the attribute-whitelist bug class from ADR L001)
- Service return types accurately reflect what's queried
- JSONB field shapes are explicit at the type level
- Instance methods have typed signatures

Three patterns exist for typing Sequelize v6 models. Full evaluation with code examples is in `docs/typescript-sequelize-pattern-proposal.md`.

## Decision

Use Sequelize v6's built-in TypeScript generics: `InferAttributes`, `InferCreationAttributes`, `CreationOptional`, `NonAttribute`, and `ForeignKey`. These ship with Sequelize itself (available since v6.14.0, present in our v6.37.7).

The primary reason is **lowest disruption with real type safety today.** The `Model.init()` calls stay identical. The factory export pattern stays unchanged. What gets added: `declare` property declarations above init, generic type parameters on `extends Model<...>`, and association mixin declarations. This gives us compile-time enforcement of model attributes without rewriting the model layer.

The v7 forward path is a genuine secondary benefit — Sequelize v7 keeps the same generic pattern and adds optional decorators on top — but it is not the lead argument. We are choosing this pattern because it works for our v6 codebase today.

## Alternatives considered

**sequelize-typescript decorators.** Replaces `Model.init()` with `@Table`, `@Column` decorators. Most TypeScript-native feel, but requires a full model rewrite — the factory pattern is incompatible. The library has 231 open issues, and Sequelize v7 built its own decorator system from scratch rather than absorbing it. Rejected: too disruptive, dead-end library.

**Manual interfaces alongside existing models.** Keep all `.js` model files, create parallel TypeScript interfaces in a `types/` directory. Zero model changes, but the interface and the `Model.init()` call can drift out of sync — which is the exact class of bug we're migrating to prevent. Rejected: adds types without adding safety.

## Consequences

**Intended:**

- Model attributes are compile-time enforced. A handler accessing `study.parsed_budget_amount` when the service used an `attributes:` whitelist that excluded it will fail compilation.
- JSONB fields have explicit TypeScript shapes. The runtime data is `DataTypes.JSONB`; the compile-time type is the actual interface.
- Instance methods have typed signatures (`recordOutreachSent(method: 'email' | 'slack' | 'phone' | 'other')`).
- Association mixins provide typed return values (`getParticipants(): Promise<StudyParticipant[]>`).

**Accepted costs:**

- **Mixin declaration verbosity.** Every association requires manual mixin declarations (`HasManyGetAssociationsMixin<T>`, `HasManyAddAssociationMixin<T, number>`, etc.). For ResearchStudy with 5 `hasMany` associations, this is ~15-20 lines of declarations. The migrated models read more verbosely than the current JavaScript versions. This is the main ergonomic cost and we accept it as the price of typed associations.

- **DECIMAL fields return strings.** Sequelize's `DECIMAL(10,2)` type (`parsed_budget_amount`, `compensation_amount`) returns JavaScript strings, not numbers. The TypeScript type will be `string | null`, which is accurate to Sequelize's actual behavior but surprising to consumers expecting numbers. When Phase 3 migrates the service layer, we may need boundary coercion (e.g., `parseFloat` at the service return boundary) so consumers see numbers consistently. Phase 3 should address this per-field rather than inventing a blanket pattern now.

- **~15-20 lines of `declare` statements per model.** For 13 models, roughly 200-250 lines of type declarations total. This is one-time work that permanently closes the attribute-whitelist bug class.

**Patterns requiring special handling in Phase 3:**

- SessionObserver custom getters on JSONB array fields — use `NonAttribute` for getter return types
- User hooks (beforeSave, afterCreate, afterDestroy) — remain in init config, `this` is typed by model generics
- SlackUserState non-standard PK (`slack_user_id: string`) — declare without `CreationOptional`
- DECIMAL fields — type as `string | null`, add boundary coercion in Phase 3 if needed

## When to revisit

- If Sequelize v7 migration happens, evaluate whether the new decorator support changes the ergonomics enough to adopt decorators. The generic pattern carries forward regardless.
- If the mixin verbosity becomes a significant maintenance burden across 13+ models, consider generating mixin declarations from model definitions (tooling, not pattern change).

## References

- Full evaluation with code examples: `docs/typescript-sequelize-pattern-proposal.md`
- TypeScript migration decision: ADR 0013, `docs/typescript-migration-plan.md`
- Attribute whitelist bug that motivates typed models: ADR L001
