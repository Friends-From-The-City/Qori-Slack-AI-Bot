# Sequelize TypeScript Pattern Proposal

**Date:** 2026-05-13  
**Status:** Awaiting owner review  
**Context:** Phase 2 of the TypeScript migration (ADR 0013). This decision affects how all 13 models get typed in Phase 3.

---

## Current state

All 13 models use the same pattern: factory functions exporting a `Class extends Model` with `Model.init()`, CommonJS modules, manual timestamp management. The codebase uses Sequelize v6 (package.json says `^6.20.1`, lockfile resolves to `6.37.7`).

Key patterns to accommodate:
- **Associations:** 5 `hasMany` on ResearchStudy, 6 `belongsTo` on child models
- **JSONB fields:** `StudyVariable.value`, `SessionObserver.requester_id/requester_name`
- **Custom getters:** SessionObserver has array-coercion getters on JSONB fields
- **Instance methods:** `StudyParticipant.recordOutreachSent()`, `User.generateToken/validatePassword/sendMail`
- **Validators:** `isIn` on StudyParticipant's `status_select` and `outreach_method`
- **ENUM types:** SessionObserver uses `DataTypes.ENUM`, StudyStatus uses `DataTypes.ENUM`
- **Non-standard PK:** SlackUserState uses `slack_user_id` (STRING) instead of auto-increment integer

---

## Options evaluated

### Option 1: `sequelize-typescript` decorators

Replaces `Model.init()` with `@Table`, `@Column`, `@HasMany` decorators. Requires `reflect-metadata` and `experimentalDecorators`.

**Pros:**
- Most "TypeScript-native" feel — decorators infer column types
- Associations are expressed as decorators, automatically typed

**Cons:**
- **Full model rewrite.** Every `Model.init()` call must be converted to decorator syntax. The factory pattern (`module.exports = (sequelize) => {}`) is incompatible — `sequelize-typescript` uses `sequelize.addModels([])` instead.
- **Dead-end library.** Sequelize v7 built its own decorator system from scratch rather than absorbing this package. 231 open issues, slowing release cadence. Using it ties us to a library with no forward path.
- **New dependency** (`sequelize-typescript` + `reflect-metadata`) for a migration whose goal is type safety, not framework changes.

**Verdict:** Rejected. Too disruptive, and the library has no future past v6.

### Option 2: Manual interfaces alongside existing models

Keep all `.js` model files unchanged. Create parallel TypeScript interfaces in `types/models.ts`. Consumers import the interface for compile-time checking.

**Pros:**
- **Zero model changes.** Interface files are purely additive.
- **No library dependency.**
- **Lowest risk.** Can't break anything since runtime code is untouched.

**Cons:**
- **Synchronization burden.** The interface and the `Model.init()` call can drift — adding a column to `.init()` without updating the interface, or vice versa. This is the exact class of bug we're migrating to prevent.
- **Association typing is manual boilerplate.** Every association mixin (`getParticipants`, `addParticipant`, etc.) must be hand-declared.
- **Models stay `.js` forever.** Since the interface is separate, there's no natural migration path to typed model files. We'd be creating a parallel system rather than migrating.
- **Lowest type safety.** TypeScript can't verify that the interface matches reality.

**Verdict:** Too weak. It adds types without adding safety. The synchronization problem is the same class of bug we're trying to eliminate.

### Option 3: Sequelize v6 built-in TypeScript generics (recommended)

Uses generic type parameters on `Model` plus utility types that ship with Sequelize itself: `InferAttributes`, `InferCreationAttributes`, `CreationOptional`, `NonAttribute`, `ForeignKey`.

**Pros:**
- **`Model.init()` stays identical.** The init config object doesn't change. What changes: `declare` property declarations above init, generic params on `extends Model<...>`.
- **No new dependencies.** These types ship with Sequelize v6.14+. Already available in our v6.37.7.
- **Best v7 migration path.** Sequelize v7 keeps the same generic pattern and adds optional decorators on top. This approach carries forward cleanly.
- **Real type enforcement.** `InferAttributes` derives the type from the `declare` statements. If a `declare` doesn't exist for a column, it won't be in the type. If a handler accesses a field that doesn't exist on the type, it fails compilation.
- **Association mixins are typed.** `HasManyGetAssociationsMixin<StudyParticipant>` etc. — verbose but correct.

**Cons:**
- **Moderate migration effort.** Each model file gets ~15-20 lines of `declare` statements added. Still, the init call and association setup are untouched.
- **Mixin declarations are boilerplate.** For a model with 5 `hasMany` associations (ResearchStudy), you need ~15-20 lines of mixin declarations. This is the main papercut.
- **Models must be `.ts` files.** The `declare` syntax doesn't work in `.js`. This means Phase 3 migrates model files to `.ts` as part of the service migration.

**Verdict:** Best balance of safety, effort, and forward compatibility.

---

## Concrete example: StudyParticipant

### Current code (JavaScript)

```javascript
module.exports = (sequelize) => {
  class StudyParticipant extends Model {
    static associate(models) {
      this.belongsTo(models.ResearchStudy, {
        foreignKey: "study_id",
        as: "study",
        onDelete: "CASCADE",
      });
    }

    async recordOutreachSent(method = 'email') {
      this.outreach_sent_at = new Date();
      this.outreach_method = method;
      this.outreach_count = (this.outreach_count || 0) + 1;
      this.updated_at = new Date();
      if (this.status_select === PARTICIPANT_STATUS.NOT_CONTACTED) {
        this.status_select = PARTICIPANT_STATUS.CONTACTED;
      }
      await this.save();
    }
  }

  StudyParticipant.init({ /* ... columns ... */ }, { sequelize });
  return StudyParticipant;
};
```

### Option 2 (manual interfaces) — what it would look like

```typescript
// types/models.ts — separate file, model stays .js
export interface StudyParticipantAttributes {
  id: number;
  study_id: number;
  participant_name: string;
  contact_details: string | null;
  status_select: ParticipantStatus | null;
  outreach_sent_at: Date | null;
  outreach_method: 'email' | 'slack' | 'phone' | 'other' | null;
  outreach_count: number;
  // ... every column
}

// Consumer has to cast:
const p = await StudyParticipant.findByPk(id) as StudyParticipantAttributes;
```

The model file stays `.js`. The interface is a separate assertion that can drift from reality.

### Option 3 (built-in generics) — what it would look like

```typescript
// models/study_participant.ts — model file itself becomes .ts

import {
  Model, DataTypes, ForeignKey, NonAttribute,
  InferAttributes, InferCreationAttributes, CreationOptional,
  BelongsToGetAssociationMixin,
} from 'sequelize';
import type { Sequelize } from 'sequelize';
import type { ResearchStudy } from './research_study';
import {
  PARTICIPANT_STATUS, PARTICIPANT_STATUS_VALUES,
  type ParticipantStatus,
} from '../../constants/participantStatus';

export default (sequelize: Sequelize) => {
  class StudyParticipant extends Model<
    InferAttributes<StudyParticipant>,
    InferCreationAttributes<StudyParticipant>
  > {
    // — Attributes —
    declare id: CreationOptional<number>;
    declare study_id: ForeignKey<number>;
    declare participant_name: string;
    declare contact_details: string | null;
    declare recruitment_source: string | null;
    declare scheduled_date: string | null;
    declare scheduled_time: string | null;
    declare status_select: ParticipantStatus | null;
    declare notes_field: string | null;
    declare demographics_info: Record<string, unknown> | null;
    declare compensation_amount: number | null;
    declare outreach_sent_at: Date | null;
    declare outreach_method: 'email' | 'slack' | 'phone' | 'other' | null;
    declare outreach_count: CreationOptional<number>;
    declare added_by: string;
    declare created_at: CreationOptional<Date>;
    declare updated_at: CreationOptional<Date>;

    // — Association mixins —
    declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;
    declare study?: NonAttribute<ResearchStudy>;

    // — Associations —
    static associate(models: Record<string, typeof Model>) {
      this.belongsTo(models.ResearchStudy, {
        foreignKey: 'study_id',
        as: 'study',
        onDelete: 'CASCADE',
      });
    }

    // — Instance methods —
    async recordOutreachSent(method: 'email' | 'slack' | 'phone' | 'other' = 'email') {
      this.outreach_sent_at = new Date();
      this.outreach_method = method;
      this.outreach_count = (this.outreach_count || 0) + 1;
      this.updated_at = new Date();
      if (this.status_select === PARTICIPANT_STATUS.NOT_CONTACTED) {
        this.status_select = PARTICIPANT_STATUS.CONTACTED;
      }
      await this.save();
    }
  }

  StudyParticipant.init(
    {
      // ... identical init call as today ...
    },
    {
      tableName: 'study_participants',
      underscored: true,
      timestamps: false,
      sequelize,
    }
  );

  return StudyParticipant;
};
```

**What changed from the current code:**
1. Generic params added to `extends Model<...>`
2. `declare` statements above init — these are the type definitions
3. Association mixin declaration (`getStudy`)
4. Instance method parameter gets a type annotation
5. File is `.ts` instead of `.js`

**What did NOT change:**
- The `Model.init()` call (identical columns, config)
- The `static associate()` method (same logic)
- The factory export pattern
- The `recordOutreachSent` logic

---

## Patterns that need special handling

1. **SessionObserver custom getters.** The JSONB array fields with custom `get()` functions that coerce null → `[]`. These would use `NonAttribute` for the getter return type and `declare` the underlying field as `unknown[] | null`. Workable but needs care.

2. **User hooks (beforeSave, afterCreate, afterDestroy).** Hooks remain in the init config, untyped. The hook bodies reference `this` which will be typed by the model generics. Should work without issues.

3. **SlackUserState non-standard PK.** Uses `slack_user_id: STRING` as PK instead of auto-increment `id`. The `declare` pattern handles this — just declare `slack_user_id: string` without `CreationOptional`.

4. **DECIMAL fields.** `parsed_budget_amount` and `compensation_amount` are `DECIMAL(10,2)`. Sequelize returns these as strings in some contexts, numbers in others. The type should be `string | null` (Sequelize's actual behavior for DECIMAL) with a note about this footgun.

---

## Recommendation

**Use Sequelize v6 built-in TypeScript generics (Option 3).** 

- No new dependencies
- `Model.init()` calls stay unchanged
- Forward-compatible with Sequelize v7
- Provides real compile-time enforcement of model attributes
- Moderate, predictable migration effort per model file

The main cost is ~15-20 lines of `declare` statements per model. For 13 models, that's ~200-250 lines of type declarations total — a one-time investment that permanently closes the attribute-whitelist bug class.

---

## Status

**Approved 2026-05-13.** Owner approved Option 3. ADR 0014 filed. Phase 2 Part B (type definitions) completed same day.

Type files created:
- `backend/src/types/cascade.ts` — 38 interfaces covering all cascade variables
- `backend/src/types/common.ts` — branded IDs, shared enums
- `backend/src/types/models.ts` — 13 model attribute + creation interfaces
- `backend/src/types/handlers.ts` — shared handler context types, TemplateContractError
- `backend/src/types/template-processor.ts` — YAML processor I/O types
- `backend/src/types/index.ts` — barrel export
