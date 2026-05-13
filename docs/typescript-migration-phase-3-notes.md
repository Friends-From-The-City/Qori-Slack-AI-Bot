# TypeScript Migration Phase 3 — Patterns and Notes

**Date:** 2026-05-13
**Reference files:** `study_participant.ts` (model), `research_study.ts` (model), `study_participant.service.ts` (service)

These patterns were established in the Stage 1 reference migration and approved by the project owner. Every subsequent model and service follows the same approach.

---

## Model pattern (Option A — class at module scope)

### Structure

```typescript
// 1. Imports at top
import { DataTypes, Model, type InferAttributes, ... } from 'sequelize';
import type { OtherModel } from './other_model';  // type-only for associations

// 2. Class defined at module scope (not inside factory)
class MyModel extends Model<
  InferAttributes<MyModel>,
  InferCreationAttributes<MyModel>
> {
  // 3. Declare all attributes
  declare id: CreationOptional<number>;
  declare some_field: string;
  declare nullable_field: string | null;
  declare fk_field: ForeignKey<number>;
  declare defaulted_field: CreationOptional<number>;
  declare created_at: CreationOptional<Date>;

  // 4. Declare association mixins with specific model types
  declare getOther: BelongsToGetAssociationMixin<OtherModel>;
  declare other?: NonAttribute<OtherModel>;

  // 5. Static associate (models param is Record<string, any>)
  static associate(models: Record<string, any>) { ... }

  // 6. Instance methods with typed signatures
  async doSomething(param: SomeType): Promise<void> { ... }
}

// 7. Factory function — only contains init() call
module.exports = (sequelize: Sequelize) => {
  MyModel.init({ /* column definitions unchanged */ }, { sequelize });
  return MyModel;
};

// 8. Type export for consumers
export type { MyModel };
```

### Why the class is at module scope

The class must be importable as a type by services and other models. When it was inside the factory function, there was no way to import the type — services had to use `Model` (the base class) as return types, losing all attribute typing.

Moving the class to module scope changes nothing at runtime — the factory still calls `init()` and returns the class. What changes is that `import type { MyModel }` now works from other files.

### Association mixins reference specific types, not `Model`

```typescript
// ✅ Correct — typed association
declare getStudy: BelongsToGetAssociationMixin<ResearchStudy>;

// ❌ Wrong — untyped, defeats the purpose
declare getStudy: BelongsToGetAssociationMixin<Model>;
```

Circular `import type` between models (e.g., StudyParticipant ↔ ResearchStudy) is fine — TypeScript erases type-only imports at compile time.

### Models not yet migrated

When a model references another model that hasn't been migrated yet, use `Model` temporarily for that association's mixin type. Update it when the referenced model is migrated.

---

## Service pattern — typed model references

### Cast once at the top

```typescript
import type { StudyParticipant } from '../database/models/study_participant';
import type { ResearchStudy } from '../database/models/research_study';

const sequelize = require('../database');

// Typed model references — cast once, use everywhere
const StudyParticipantModel = sequelize.models.StudyParticipant as typeof StudyParticipant;
const ResearchStudyModel = sequelize.models.ResearchStudy as typeof ResearchStudy;
```

**Naming convention:** `<ModelName>Model` for the typed reference. Every service uses this pattern. The cast happens once per model used; all subsequent `findByPk`, `findAll`, `create`, etc. calls return properly typed results.

### Return types are model classes, not `Model`

```typescript
// ✅ Correct — consumers see typed attributes
async getParticipantById(id: number): Promise<StudyParticipant | null> { ... }

// ❌ Wrong — consumers see generic Model
async getParticipantById(id: number): Promise<Model | null> { ... }
```

### Aggregate queries use `as any` at the boundary

Sequelize's aggregate functions (`fn('COUNT', ...)`) return untyped `dataValues`. This is a Sequelize limitation. Use `as any` only for accessing aggregate `dataValues`, not for model attributes:

```typescript
const total = breakdown.reduce(
  (sum: number, item) => sum + parseInt((item as any).dataValues.count, 10),
  0,
);
```

---

## DECIMAL field handling (Approach A)

Add a custom getter on every `DECIMAL` column. The getter coerces Sequelize's string return to a number:

```typescript
// In declare statements:
declare parsed_budget_amount: number | null;

// In init() column definition:
parsed_budget_amount: {
  type: DataTypes.DECIMAL(10, 2),
  allowNull: true,
  get() {
    const raw = this.getDataValue('parsed_budget_amount');
    return raw === null || raw === undefined ? null : parseFloat(raw as unknown as string);
  },
},
```

**Current DECIMAL fields:** `parsed_budget_amount` (ResearchStudy), `compensation_amount` (StudyParticipant). Apply the same getter to any future DECIMAL fields.

---

## `any` usage policy

Two justified `any` patterns in the reference files:

1. **`static associate(models: Record<string, any>)`** — Sequelize's dynamic model registry passes untyped model constructors. This `any` exists on all 13 models. No way around it without a custom typed registry, which isn't worth the complexity.

2. **`(item as any).dataValues.count`** — Sequelize aggregate queries. The `dataValues` on aggregate results don't carry column types. Limited to `getRecruitmentBreakdown` and similar aggregate functions.

No other `any` usage is acceptable. If TypeScript can't infer a type, define an interface for it.

---

## tsconfig changes from Phase 3

- Added `"types": ["jest", "node"]` to make Jest globals visible in `.test.ts` files
- Removed `**/*.test.ts` from `exclude` so test files are type-checked
- ts-jest configured to ignore diagnostic 151002 (node16 module warning)

---

## Verified end-to-end

The type verification test (`__tests__/type-verification.test.ts`) confirms:

- `participant.compensation_amount` is `number | null`
- `participant.getStudy()` returns `ResearchStudy` (not generic `Model`)
- `study.parsed_budget_amount` is `number | null` through the association
- `study.getParticipants()` returns `StudyParticipant[]` with typed fields

Association typing threads through correctly. Phase 4 handlers will see fully typed model attributes.
