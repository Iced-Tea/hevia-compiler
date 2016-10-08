import { TT, Type, Token, Operator } from "../token";

/**
 * @param {Node} node
 */
export function emitProgram(node) {
  this.expectNodeKind(node, Type.Program);
  this.write("(function() ");
  this.emitBlock(node.body);
  this.write(")();");
}

/**
 * @param {Node} node
 */
export function emitBlock(node) {
  this.expectNodeKind(node, Type.BlockStatement);
  let ii = 0;
  let length = node.body.length;
  let statement = null;
  this.write("{\n");
  this.indent();
  for (; ii < length; ++ii) {
    statement = node.body[ii];
    this.writeIndent();
    this.emitStatement(statement);
    this.write(";");
    if (ii + 1 < length) this.write("\n");
  };
  this.write("\n");
  this.outdent();
  this.writeIndent();
  this.write("}");
}

/**
 * @param {Node} node
 */
export function emitStatement(node) {
  let isExpression = this.isExpression(node);
  if (isExpression) {
    this.emitExpression(node);
    return void 0;
  }
  switch (node.kind) {
    case Type.FunctionDeclaration:
      if (this.insideClass) {
        this.write(node.parent.name);
        this.write(".prototype.");
        this.write(node.name);
      } else {
        this.write("var ");
        this.write(node.name);
      }
      this.write(" = ");
      this.write("function ");
      this.emitArguments(node.arguments);
      this.emitBlock(node.body);
    break;
    case Type.ClassDeclaration:
      // class
      this.write("function ");
      this.write(node.name);
      this.emitArguments(node.ctor.arguments);
      // fake constructor body
      this.insideClass = true;
      this.emitBlock(node.body);
      this.insideClass = false;
      for (let key of node.body.body) {
        if (key.isStatic) {
          this.emitStatement(key);
        }
      };
    break;
    case Type.EnumDeclaration:
      let name = node.name.value;
      this.write("var ");
      this.emitStatement(node.name);
      this.write(";\n");
      this.writeIndent();
      this.write(`(function(${name}) {\n`);
      let ii = 0;
      let length = node.keys.length;
      this.indent();
      for (; ii < length; ++ii) {
        let value = node.keys[ii].value;
        this.writeIndent();
        this.write(name);
        this.write("[");
        this.write(name);
        this.write(`["${value}"]`);
        this.write(" = ");
        this.write(ii);
        this.write("]");
        this.write(" = ");
        this.write(`"${value}"`);
        this.write(";\n");
      };
      this.writeIndent();
      this.outdent();
      this.write(`})(${name} || (${name} = {}))`);
    break;
    case Type.ConstructorDeclaration:
      // only emit if constructors contains sth
      if (node.body.length) {
        this.write("(function() ");
        this.emitBlock(node.body);
        this.write(").call(this)");
      }
      // return instance, not necessary?
      if (this.insideClass) {
        //this.writeInject(`return (this)`);
      }
    break;
    case Type.VariableDeclaration:
      if (this.insideClass && node.isStatic) {
        return void 0;
      }
      if (node.isStatic && !this.insideClass) {
        this.write("\n");
        this.writeIndent();
        this.write(node.parent.name);
        this.write(".");
      }
      else if (this.insideClass) {
        this.write("this.");
      }
      //else if (node.isConstant) this.write("const ");
      else this.write("var ");
      this.write(node.declaration.name.value);
      this.write(" = ");
      if (node.declaration.isPointer) {
        this.write("{ $iov: ");
        this.emitStatement(node.init);
        this.write(" }");
      } else {
        this.emitStatement(node.init);
      }
    break;
    case Type.OperatorDeclaration:
      this.write("var ");
      this.write(`__OP__${node.operator}`);
      this.write(" = ");
      this.write("function ");
      this.emitArguments(node.ctor.arguments);
      this.emitBlock(node.ctor.body);
    break;
    case Type.IfStatement:
      let parent = node.parent;
      if (node.test !== null) {
        if (parent && parent.kind === Type.IfStatement) {
          this.write(" else ");
        }
        this.write("if (");
        this.emitStatement(node.test);
        this.write(") ");
      } else {
        this.write(" else ");
      }
      this.emitBlock(node.consequent);
      if (node.alternate !== null) {
        this.emitStatement(node.alternate);
      }
    break;
    case Type.ReturnStatement:
      this.write("return ");
      this.write("(");
      this.emitStatement(node.argument);
      this.write(")");
    break;
    case Type.ImportDeclaration: break;
    default:
      this.throw(`Invalid node kind '${this.getNodeKindAsString(node)}'`);
    break;
  };
  return void 0;
}

/**
 * @param {Node} node
 */
export function emitExpression(node) {
  switch (node.kind) {
    case Type.BinaryExpression:
      let op = this.getOperatorAsString(node.operator);
      let isParenthised = node.isParenthised;
      if (isParenthised) this.write("(");
      if (this.isNativeOperator(node)) {
        this.emitStatement(node.left);
        this.write(` ${op} `);
        this.emitStatement(node.right);
      } else {
        this.write(`__OP__${op}`);
        this.write("(");
        this.emitStatement(node.left);
        this.write(", ");
        this.emitStatement(node.right);
        this.write(")");
      }
      if (isParenthised) this.write(")");
    break;
    case Type.TernaryExpression:
      this.emitStatement(node.test);
      this.write(" ? ");
      this.emitStatement(node.consequent);
      this.write(" : ");
      this.emitStatement(node.alternate);
    break;
    case Type.MemberExpression:
      this.emitStatement(node.object);
      this.write(".");
      this.emitStatement(node.property);
    break;
    case Type.CallExpression:
      if (node.isInstantiatedClass) {
        this.write("new ");
      }
      this.emitStatement(node.callee);
      this.emitParameters(node.arguments);
    break;
    case Type.TypeExpression:
      this.write(node.name.value);
    break;
    case Type.Literal:
      let value = (
        this.isThisNode(node) ? "this" :
        node.type === Token.BooleanLiteral ? TT[node.value].toLowerCase() :
        node.type === Token.NullLiteral ? "null" :
        node.value
      );
      if (node.isReference && !node.isParameter) {
        this.write(`${value}.$iov`);
      } else {
        this.write(value);
      }
    break;
    default:
      this.throw(`Invalid node kind '${this.getNodeKindAsString(node)}'`);
    break;
  };
}

/**
 * @param {Node} node
 */
export function isExpression(node) {
  let kind = node.kind;
  return (
    kind === Type.BinaryExpression ||
    kind === Type.TernaryExpression ||
    kind === Type.MemberExpression ||
    kind === Type.CallExpression ||
    kind === Type.TypeExpression ||
    kind === Type.Literal
  );
}

/**
 * @param {Array} args
 */
export function emitParameters(args) {
  let ii = 0;
  let length = args.length;
  this.write("(");
  for (; ii < length; ++ii) {
    this.emitStatement(args[ii]);
    if (ii + 1 < length) this.write(", ");
  };
  this.write(")");
}

/**
 * @param {Array} args
 */
export function emitArguments(args) {
  this.emitParameters(args);
  this.write(" ");
}