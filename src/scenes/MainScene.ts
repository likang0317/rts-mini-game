import Phaser from 'phaser';

const TILE_SIZE = 48;
const MAP_COLS = 40;
const MAP_ROWS = 30;
const WORLD_WIDTH = MAP_COLS * TILE_SIZE;
const WORLD_HEIGHT = MAP_ROWS * TILE_SIZE;
const UNIT_SPEED = 140;
const CAMERA_PAN_SPEED = 620;
const HOME_TILE = { x: 8, y: 21 };

interface Unit {
  body: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  target: Phaser.Math.Vector2 | null;
}

/** M1 骨架：地图、镜头、框选与移动，暂不含资源与战斗。 */
export class MainScene extends Phaser.Scene {
  private units: Unit[] = [];
  private selected = new Set<Unit>();
  private dragStart: Phaser.Math.Vector2 | null = null;
  private selectionBox!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private shiftKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private homeKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.drawMap();
    this.selectionBox = this.add.graphics().setDepth(900);

    this.createBase(8, 22, '己方基地', 0x2f6f9f);
    this.createBase(32, 8, '敌方基地', 0xa34a4a);

    this.units.push(this.createUnit(6, 20, 0x4dabf7));
    this.units.push(this.createUnit(7, 20, 0x4dabf7));
    this.units.push(this.createUnit(6, 21, 0x4dabf7));

    this.cameras.main.centerOn(HOME_TILE.x * TILE_SIZE, HOME_TILE.y * TILE_SIZE);
    this.setupInput();
    this.createHud();
    this.refreshHud();
  }

  update(_time: number, delta: number): void {
    this.updateCamera(delta);
    this.updateUnits(delta);

    if (Phaser.Input.Keyboard.JustDown(this.homeKey) || Phaser.Input.Keyboard.JustDown(this.cursors.space)) {
      this.cameras.main.centerOn(HOME_TILE.x * TILE_SIZE, HOME_TILE.y * TILE_SIZE);
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.clearSelection();
      this.refreshHud();
    }
  }

  private drawMap(): void {
    const g = this.add.graphics();
    g.fillStyle(0x27362b, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 中部浅水带，仅作视觉分区
    g.fillStyle(0x21384a, 0.55);
    g.fillRect(0, WORLD_HEIGHT / 2 - TILE_SIZE, WORLD_WIDTH, TILE_SIZE * 2);

    g.lineStyle(1, 0x3c5142, 0.5);
    for (let x = 0; x <= MAP_COLS; x++) {
      g.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, WORLD_HEIGHT);
    }
    for (let y = 0; y <= MAP_ROWS; y++) {
      g.lineBetween(0, y * TILE_SIZE, WORLD_WIDTH, y * TILE_SIZE);
    }

    g.lineStyle(4, 0x4b6353, 1);
    g.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private createBase(tileX: number, tileY: number, label: string, color: number): void {
    const x = tileX * TILE_SIZE;
    const y = tileY * TILE_SIZE;
    this.add.rectangle(x, y, TILE_SIZE * 2.5, TILE_SIZE * 2.5, color).setStrokeStyle(2, 0x0d141b);
    this.add
      .text(x, y - TILE_SIZE * 1.8, label, { fontFamily: 'sans-serif', fontSize: '14px', color: '#d7e2ea' })
      .setOrigin(0.5);
  }

  private createUnit(tileX: number, tileY: number, color: number): Unit {
    const x = tileX * TILE_SIZE + TILE_SIZE / 2;
    const y = tileY * TILE_SIZE + TILE_SIZE / 2;
    const ring = this.add.rectangle(x, y, 36, 36).setStrokeStyle(2, 0x7ef2c8).setVisible(false);
    const body = this.add.rectangle(x, y, 26, 26, color).setStrokeStyle(1, 0x0b1220);
    const hpBar = this.add.rectangle(x, y - 21, 30, 4, 0x5fdc7a);
    return { body, ring, hpBar, target: null };
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('键盘输入不可用');
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.homeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.commandMove(pointer.worldX, pointer.worldY);
        return;
      }
      if (pointer.leftButtonDown()) {
        this.dragStart = new Phaser.Math.Vector2(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        const cam = this.cameras.main;
        cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom;
        cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom;
        return;
      }
      if (this.dragStart) this.drawSelectionBox(pointer.worldX, pointer.worldY);
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.leftButtonReleased()) return;
      const start = this.dragStart;
      this.dragStart = null;
      this.selectionBox.clear();
      this.applySelection(start, new Phaser.Math.Vector2(pointer.worldX, pointer.worldY));
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.6, 1.5));
    });
  }

  private createHud(): void {
    this.hud = this.add
      .text(16, 16, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#d7e2ea',
        backgroundColor: '#0d141bcc',
        padding: { x: 12, y: 10 },
        lineSpacing: 6
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  private refreshHud(): void {
    this.hud.setText([
      'RTS小游戏 · 骨架版',
      '左键点击/拖拽框选，右键移动',
      'WASD/方向键平移，滚轮缩放，H 回基地',
      `已选中 ${this.selected.size} 个单位`
    ]);
  }

  private drawSelectionBox(worldX: number, worldY: number): void {
    const start = this.dragStart;
    if (!start) return;
    const x = Math.min(start.x, worldX);
    const y = Math.min(start.y, worldY);
    const width = Math.abs(worldX - start.x);
    const height = Math.abs(worldY - start.y);
    this.selectionBox
      .clear()
      .fillStyle(0x7ef2c8, 0.08)
      .fillRect(x, y, width, height)
      .lineStyle(1, 0x7ef2c8, 0.9)
      .strokeRect(x, y, width, height);
  }

  private applySelection(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): void {
    const additive = this.shiftKey.isDown;
    const isClick = Math.abs(end.x - start.x) < 6 && Math.abs(end.y - start.y) < 6;

    if (!additive) this.clearSelection();

    if (isClick) {
      const hit = this.units.find(
        (unit) => Phaser.Math.Distance.Between(unit.body.x, unit.body.y, end.x, end.y) <= 22
      );
      if (hit) this.toggleUnit(hit, additive);
    } else {
      const rect = new Phaser.Geom.Rectangle(
        Math.min(start.x, end.x),
        Math.min(start.y, end.y),
        Math.abs(end.x - start.x),
        Math.abs(end.y - start.y)
      );
      this.units.forEach((unit) => {
        if (Phaser.Geom.Rectangle.Contains(rect, unit.body.x, unit.body.y)) this.toggleUnit(unit, true);
      });
    }

    this.refreshHud();
  }

  private toggleUnit(unit: Unit, additive: boolean): void {
    if (additive && this.selected.has(unit)) {
      this.selected.delete(unit);
      unit.ring.setVisible(false);
      return;
    }
    this.selected.add(unit);
    unit.ring.setVisible(true);
  }

  private clearSelection(): void {
    this.selected.forEach((unit) => unit.ring.setVisible(false));
    this.selected.clear();
  }

  private commandMove(worldX: number, worldY: number): void {
    if (this.selected.size === 0) return;
    const targets = Array.from(this.selected);
    const columns = Math.ceil(Math.sqrt(targets.length));
    const rows = Math.ceil(targets.length / columns);

    targets.forEach((unit, index) => {
      const offsetX = ((index % columns) - (columns - 1) / 2) * 34;
      const offsetY = (Math.floor(index / columns) - (rows - 1) / 2) * 34;
      unit.target = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(worldX + offsetX, TILE_SIZE, WORLD_WIDTH - TILE_SIZE),
        Phaser.Math.Clamp(worldY + offsetY, TILE_SIZE, WORLD_HEIGHT - TILE_SIZE)
      );
    });
  }

  private updateUnits(delta: number): void {
    const step = (UNIT_SPEED * delta) / 1000;

    for (const unit of this.units) {
      if (unit.target) {
        const distance = Phaser.Math.Distance.Between(unit.body.x, unit.body.y, unit.target.x, unit.target.y);
        if (distance <= step) {
          unit.body.setPosition(unit.target.x, unit.target.y);
          unit.target = null;
        } else {
          const angle = Phaser.Math.Angle.Between(unit.body.x, unit.body.y, unit.target.x, unit.target.y);
          unit.body.x += Math.cos(angle) * step;
          unit.body.y += Math.sin(angle) * step;
        }
      }
      unit.ring.setPosition(unit.body.x, unit.body.y);
      unit.hpBar.setPosition(unit.body.x, unit.body.y - 21);
    }
  }

  private updateCamera(delta: number): void {
    const cam = this.cameras.main;
    const speed = (CAMERA_PAN_SPEED * delta) / 1000 / cam.zoom;
    let dx = 0;
    let dy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= speed;
    if (this.cursors.right.isDown || this.wasd.D.isDown) dx += speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= speed;
    if (this.cursors.down.isDown || this.wasd.S.isDown) dy += speed;

    cam.scrollX += dx;
    cam.scrollY += dy;
  }
}
