import { TT, Type, Token, Operator, Node } from "../token";

/**
 * @param {Node} node
 */
export function Literal(node) {
  this.resolveType(node);
  let type = node.resolvedType.value;
  if (node.parent.kind === Type.BinaryExpression) {
    if (!this.isNativeOperator(node.parent)) {
      this.traceLaterOperatorReference(node);
    }
  }
  this.resolveReturnType(node, type);
}

/**
 * @param {Node} node
 */
export function CallExpression(node) {
  this.resolveType(node);
  let type = node.resolvedType.value;
  this.resolveReturnType(node, type);
}

/**
 * @param {Node} node
 */
export function BinaryExpression(node) {
  this.resolveType(node);
  let type = node.resolvedType.value;
  this.resolveReturnType(node, type);
}

/**
 * @param {Node} node
 */
export function TernaryExpression(node) {
  this.resolveType(node);
  let type = node.resolvedType.value;
  this.resolveReturnType(node, type);
}

/**
 * @param {Node} node
 */
export function MemberExpression(node) {
  this.resolveType(node);
  let type = node.resolvedType.value;
  this.resolveReturnType(node, type);
  node.isAbsolute = node.object.kind === Type.Literal;
}

/**
 * @param {Node} node
 */
export function IfStatement(node) {
  let isElse = !!(node.parent && node.parent.kind === Type.IfStatement && !node.test);
  if (node.test !== null) {
    this.resolveType(node.test);
    let type = node.test.resolvedType.value;
    if (type !== "Boolean") {
      this.throw(`IfStatement condition expected 'Boolean' but got '${type}'`, node);
    }
  }
}

/**
 * @param {Node} node
 */
export function ReturnStatement(node) {
  let expr = node.argument;
  this.resolveType(expr);
  let returnType = expr.resolvedType.value;
  if (!this.returnContext) {
    this.throw(`Invalid return context`, node);
  }
  let returnContext = this.returnContext.type.value;
  let target = this.getDeclarationName(this.returnContext);
  if (returnContext === "Void") {
    this.throw(`Invalid return statement in '${target}'`, node);
  }
  if (returnContext !== returnType) {
    this.throw(`'${target}' returns '${returnContext}' but got '${returnType}'`, node);
  }
  this.resolveReturnStatement(node);
}

/**
 * @param {Node} node
 */
export function VariableDeclaration(node) {
  // is class property?
  if (node.parent.kind === Type.ClassDeclaration) {
    node.isClassProperty = true;
  }
  if (node.hasInferencedType) {
    let type = new Node.TypeExpression();
    type.type = node.init.resolvedType;
    type.name = node.name;
    type.init = node.init;
    node.declaration = type;
  }
  // make sure the variable type is defined
  this.resolveIdentifier(node.declaration.type.value);
  if (node.hasInferencedType) {
    node.declaration.type = node.init.resolvedType;
  }
}

/**
 * @param {Node} node
 */
export function FunctionDeclaration(node) {
  let type = node.type.value;
  if (type !== "Void" && !node.doesReturn) {
    this.throw(`Missing return '${type}' in function '${node.name}'`, node);
  }
  // is class property?
  if (node.parent !== null) {
    if (node.parent.kind === Type.ClassDeclaration) {
      node.isClassProperty = true;
    }
  }
}

/**
 * @param {Node} node
 */
export function OperatorDeclaration(node) {
  let type = node.ctor.type.value;
  if (type !== "Void" && !node.doesReturn) {
    this.throw(`Missing return '${type}' in operator '${node.operator}'`, node);
  }
}

/**
 * @param {Node} node
 */
export function ClassDeclaration(node) {
  if (!node.ctor) {
    this.throw(`Missing constructor in class '${node.name}'`, node);
  }
  node.resolvedType = this.createFakeLiteral(node.name);
  let type = node.ctor.type.value;
  if (type !== "Void" && !node.doesReturn) {
    this.throw(`Missing return '${type}' in class '${node.name}'`, node);
  }
}

/**
 * @param {Node} node
 */
export function ConstructorDeclaration(node) {
  this.expectNodeKind(node, Type.ConstructorDeclaration);
  if (!node.parent.ctor) {
    node.parent.ctor = node;
  }
  // classes automatically inherit return
  // type by their class name
  if (node.parent.kind !== Type.ClassDeclaration) {
    this.resolveIdentifier(node.type.value);
  }
}