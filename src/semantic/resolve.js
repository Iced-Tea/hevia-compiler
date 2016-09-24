import {
  parseFakeLiteral,
  TT, Type, Token, Operator
} from "../token";

import {
  getType
} from "../utils";

/**
 * @param {Node} node
 * @return {Node}
 */
export function resolveOperator(node) {
  return (this.scope.resolve(TT[node.operator]) || null);
}

/**
 * @param {String} name
 * @return {Node}
 */
export function resolveIdentifier(name) {
  if (this.isNativeType(name)) {
    let type = this.createFakeLiteral(name);
    type.isNative = true;
    return (type);
  }
  let resolve = this.scope.resolve(name);
  if (resolve === null) this.throw(`'${name}' is not defined`);
  return (resolve);
}

/**
 * @param {String} name
 * @return {Node}
 */
export function resolveVariableDeclaration(name) {
  let identifier = this.resolveIdentifier(name);
  return (
    identifier.init.parent
  );
}

/**
 * @param {Node} node
 */
export function resolveType(node) {
  switch (node.kind) {
    case Type.BinaryExpression:
      this.resolveType(node.left);
      this.resolveType(node.right);
      node.resolvedType = this.resolveExpression(node);
    break;
    case Type.CallExpression:
      let callee = node.callee.value;
      let resolve = this.scope.resolve(callee);
      if (resolve.kind === Type.FunctionDeclaration) {
        node.resolvedType = resolve.type;
      }
      else if (resolve.kind === Type.ClassDeclaration) {
        node.resolvedType = this.createFakeLiteral(callee);
      }
      else {
        this.throw(`Unsupported '${this.getNodeKindAsString(resolve)}' node type`);
      }
      this.resolveIdentifier(node.resolvedType.value);
    break;
    case Type.Literal:
      node.resolvedType = this.resolveLiteral(node);
      this.resolveIdentifier(node.resolvedType.value);
    break;
    case Type.MemberExpression:
      this.resolveType(node.object);
      node.resolvedType = this.resolveExpression(node);
    break;
    case Type.TernaryExpression:
      node.resolvedType = this.resolveExpression(node);
    break;
    default:
      this.throw(`Unsupported '${this.getNodeKindAsString(node)}' node type`);
    break;
  };
}

/**
 * @param {Node} node
 * @return {String}
 */
export function resolveLiteral(node) {
  let resolve = this.scope.resolve(node.value);
  if (resolve !== null) {
    if (resolve.kind === Type.TypeExpression) {
      return (resolve.type);
    }
    else {
      return (this.createFakeLiteral(node.value));
    }
  } else {
    if (node.type === Token.NumericLiteral) {
      return (this.createFakeLiteral(getType(parseFloat(node.value))));
    }
    else if (node.type === Token.StringLiteral) {
      return (this.createFakeLiteral("String"));
    }
    else if (node.type === Token.BooleanLiteral) {
      return (this.createFakeLiteral("Boolean"));
    }
    else if (node.type === Token.NullLiteral) {
      return (this.createFakeLiteral("Null"));
    }
    return (this.createFakeLiteral(node.value));
  }
}

/**
 * @param {String} value
 * @return {String}
 */
export function createFakeLiteral(value) {
  return (parseFakeLiteral(value));
}

/**
 * @param {Node} node
 * @return {Node}
 */
export function resolveExpression(node) {
  switch (node.kind) {
    case Type.BinaryExpression:
      return (this.resolveBinaryExpression(node));
    break;
    case Type.Literal:
      // make sure identifiers are defined
      if (node.type === Token.Identifier) {
        this.resolveIdentifier(node.value);
      }
      return (node.resolvedType);
    break;
    case Type.CallExpression:
      return (node.resolvedType);
    break;
    case Type.MemberExpression:
      return (this.resolveMemberExpression(node));
    break;
    case Type.TernaryExpression:
      return (this.resolveTernaryExpression(node));
    break;
    default:
      this.throw(`Unsupported expression: '${this.getNodeKindAsString(node)}'`);
    break;
  };
}

/**
 * @param {Node} node
 * @return {Node}
 */
export function resolveTernaryExpression(node) {
  let expr = node.test.resolvedType.value;
  let consequent = node.consequent.resolvedType.value;
  let alternate = node.alternate.resolvedType.value;
  if (expr !== "Boolean") {
    this.throw(`'TernaryExpression' expected 'Boolean' as test, but got '${expr}'`);
  }
  // result types have to match
  if (consequent !== alternate) {
    this.throw(`'TernaryExpression' has mismatching types '${consequent}' and '${alternate}'`);
  }
  return (node.consequent.resolvedType);
}

/**
 * @param {Node} node
 * @return {Node}
 */
export function resolveMemberExpression(node) {

  let object = node.object;
  let property = node.property;
  let isThis = this.isThisNode(object);

  // object member
  if (!isThis) {
    let resolve = this.resolveExpression(object);
    let obj = this.scope.resolve(resolve.value);
    if (!resolve || !obj) {
      let name = object.property ? object.property.value : object.value;
      this.throw(`'${name}' does not have member '${property.value}'`);
    }
    let returnType = this.resolveObjectMemberProperty(obj, property.value);
    if (!returnType) {
      this.throw(`'${obj.name}' does not have member '${property.value}'`);
    }
    return (returnType.type);
  }

  // local member
  let context = this.getThisContext();
  let entry = context.table[property.value];
  if (!entry) {
    let name = isThis ? "this" : object.value;
    this.throw(`'${name}' does not have member '${property.value}'`);
  }
  return (entry.type);

}

/**
 * @param {Node} node
 * @param {String} property
 * @return {Node}
 */
export function resolveObjectMemberProperty(node, property) {
  switch(node.kind) {
    case Type.ClassDeclaration:
      for (let sub of node.body.body) {
        if (!(sub.isClassProperty)) continue;
        let resolve = node.context.resolve(sub.name.value);
        if (resolve && resolve.name.value === property) {
          return (resolve);
        }
      };
    break;
    default:
      this.throw(`Unsupported member resolve node kind ${this.getNodeKindAsString(node)}`);
    break;
  }
  return (null);
}

/**
 * @param {Node} node
 * @return {Node}
 */
export function resolveBinaryExpression(node) {
  let returnType = null;
  let op = this.resolveOperator(node);
  let leftType = this.resolveExpression(node.left).value;
  let rightType = this.resolveExpression(node.right).value;
  // custom operator
  if (!this.isNativeOperator(node)) {
    returnType = op.ctor.type;
    let args = op.ctor.arguments;
    let left = args[0].type.value;
    let right = args[1].type.value;
    // prevent passing constants as inout
    if (args[0].isReference && this.isConstant(node.left.value)) {
      this.throw(`Constant '${node.left.value}' is immutable`);
    }
    // make sure left parameter is mutable if inout
    if (
      args[0].isReference &&
      node.left.type !== Token.Identifier
    ) this.throw(`Left side of ${op.operator} is not mutable`);
    if (left !== leftType) {
      this.throw(`Operator '${op.operator}' expected '${left}' but got '${leftType}'`);
    }
    // make sure right parameter is mutable if inout
    if (
      args[1].isReference &&
      node.right.type !== Token.Identifier
    ) this.throw(`Right side of ${op.operator} is not mutable`);
    if (args[1].isReference && this.isConstant(node.right.value)) {
      this.throw(`Constant '${node.right.value}' is immutable`);
    }
    if (right !== rightType) {
      this.throw(`Operator '${op.operator}' expected '${right}' but got '${rightType}'`);
    }
  }
  // native operator
  else {
    op = Operator[TT[node.operator]];
    let returns = (
      op.associativity === 2 ? leftType :
      op.associativity === 1 ? rightType :
      leftType
    );
    if (this.isAssignmentOperator(node)) {
      if (this.isConstant(node.left.value)) {
        this.throw(`Constant '${node.left.value}' is immutable`);
      }
      let resolve = null;
      let leftIsMember = node.left.kind === Type.MemberExpression;
      // only allow assignment to identifiers and members
      if (node.left.type !== Token.Identifier && !leftIsMember) {
        let msg = this.isThisNode(node.left) ? "this" : this.getNodeTypeAsString(node.left);
        this.throw(`Cannot assign to '${msg}'`);
      }
      returnType = this.createFakeLiteral(returns);
      if (leftIsMember) {
        resolve = node.left.resolvedType;
      } else {
        resolve = this.scope.resolve(node.left.value).type;
      }
      // assign expr type has to match identifier type
      if (resolve.value !== returnType.value) {
        this.throw(`Cannot assign value of type '${returnType.value}' to type '${resolve.value || resolve.value}'`);
      }
    } else {
      returnType = this.getNativeOperatorType(node);
    }
  }
  return (returnType);
}

/**
 * @param {Node} node
 * @return {Node}
 */
export function getNativeOperatorType(node) {
  let kind = node.operator;
  let returns = null;
  if (
    kind === TT.LT || kind === TT.LE ||
    kind === TT.GT || kind === TT.GE ||
    kind === TT.EQ || kind === TT.NEQ ||
    kind === TT.AND || kind === TT.OR
  ) {
    returns = this.createFakeLiteral("Boolean");
  }
  else {
    returns = this.createFakeLiteral("Int");
  }
  return (returns);
}

/**
 * @param {Node} node
 * @param {Node} arg
 * @param {Number} index
 */
export function resolveParameter(node, arg, index) {
  let callee = node.callee.value;
  let resolve = this.scope.resolve(callee);
  let args = null;
  if (resolve === null) {
    this.throw(`Cannot resolve call to '${callee}'`);
  }
  if (resolve.kind === Type.FunctionDeclaration) {
    args = resolve.arguments;
  }
  else if (resolve.kind === Type.ClassDeclaration) {
    args = resolve.ctor.arguments;
  }
  if (args[index] === void 0) {
    this.throw(`Too much arguments passed for '${callee}'`);
  }
  let isReference = args[index].isReference;
  if (isReference) {
    // only allow identifiers as inout argument
    if (arg.type !== Token.Identifier) {
      this.throw(`Argument '${args[index].name.value}' of '${callee}' is not mutable`);
    }
    let resolvedVariable = this.resolveVariableDeclaration(arg.value);
    let isContant = this.scope.resolve(arg.value).init.parent.isConstant;
    // dont allow constants as inout argument
    if (isContant) {
      this.throw(`Cannot pass immutable '${arg.value}' as reference`);
    }
  }
}

/**
 * @param {Node} node
 */
export function resolveReturnType(node, type) {
  let parent = node.parent;
  if (!parent) return void 0;
  if (parent.kind === Type.VariableDeclaration) {
    let declaration = parent.declaration;
    let parentType = declaration.type.value;
    // assign to null is allowed
    if (type === "Null") return void 0;
    if (parentType !== type) {
      this.throw(`'${declaration.name.value}' expected '${parentType}' but got '${type}'`);
    }
  }
}