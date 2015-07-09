﻿$(document).ready(function () {
    var viewmodel;
    var modalViewModel;

    var sortCalificationColumns = function (a, b) {
        if (a.Owner == b.Owner)
            return 0;
        if ((a.Owner == 0 && b.Owner > 0) ||
            (a.Owner == 1 && b.Owner == 3) ||
            (a.Owner == 2 && b.Owner == 1) ||
            (a.Owner == 2 && b.Owner == 3))
            return -1;
        return 1;
    }

    var EvaluationViewModel = function (data) {
        this.userView = '';
        this.userLogged = '';
        this.evaluation = new Evaluation();
        this.califications = [];
        this.groups = [];
        if (data) {
            this.fromJs(data);
        }
    }

    EvaluationViewModel.prototype.load = function () {
        $.getJSON("/Evaluations/api/getEvaluation/" + calificationPeriod + "/" + calificationUserName + "/", function (model) {
            viewmodel.fromJs(model);
            ko.applyBindings(viewmodel, document.getElementById('evaluation-view'));
        });
    }

    EvaluationViewModel.prototype.isDirty = dirtyFlag();

    EvaluationViewModel.prototype.isValid = function () {
        return !_.some(this.groups, function (group) {
            return _.some(group.items, function (item) {
                return _.some(item.values, function (value) {
                    return value.editable && !value.isValid()
                });
            });
        });
    }

    EvaluationViewModel.prototype.hasEmptyValues = function () {
        return _.some(this.groups, function (group) {
            return _.some(group.items, function (item) {
                return _.some(item.values, function (value) {
                    return value.editable && value.value() === ""
                });
            });
        });
    }

    EvaluationViewModel.prototype.onSave = function () {
        var self = this;
        if (this.isValid()) {
            var dto = this.toDto();
            if (this.calificationFinished) {
                dto.CalificationFinished = true;
            }
            $.ajax("/Evaluations/api/SaveEvaluationCalifications/", {
                type: "POST",
                dataType: 'json',
                contentType: 'application/json; charset=utf-8',
                data: JSON.stringify(dto),
                success: function (response) {
                    self.isDirty(false);
                    if (self.calificationFinished) {
                        if (self.userView == 0) {
                            window.location = urlGenerator.action("Index", "Home");
                        } else {
                            window.location = urlGenerator.action(calificationPeriod, "Evaluations");
                        }
                    }
                }
            });
        } else {
            modalViewModel.title("Guardar evaluación");
            modalViewModel.text("No se puede guardar la evaluación porque hay calificaciones INVÁLIDAS");
            modalViewModel.show(true);
            modalViewModel.isConfirmButtonVisible(false);
        }
    }
    
    EvaluationViewModel.prototype.onFinish = function () {
        if (this.hasEmptyValues()) {
            modalViewModel.title("Finalizar evaluación");
            modalViewModel.text("¿Desea finalizar evaluación con calificaciones vacías?");
            modalViewModel.show(true);
            modalViewModel.isConfirmButtonVisible(true);
        }
        else {
            this.calificationFinished = true;
            this.onSave(true);
        }
    }

    EvaluationViewModel.prototype.isValueEditable = function (calification) {
        return ((this.userLogged == calification.calificationColumn.evaluatorEmployee) ||
            (this.userView == 3 && calification.calificationColumn.evaluatorEmployee == "_company")) && !calification.calificationColumn.finished;
    }

    EvaluationViewModel.prototype.fromJs = function (data) {
        var self = this;
        this.userView = data.UserView;
        this.userLogged = data.UserLogged;
        this.hasAverageColumn = this.userView == 1 || this.userView == 3;
        this.numberOfColumns = "table-" + ((this.hasAverageColumn) ? (data.Califications.length + 2) : (data.Califications.length + 1)) + "-columns";
        var calificationsSorted = data.Califications.sort(sortCalificationColumns);
        this.califications = _.map(calificationsSorted, function (calification) {
            var comment = ko.observable(calification.Comments);
            self.isDirty.register(comment);
            if (calification.Owner == 3 && !calification.Califications.length) {
                self.isCompanyCalificationsEmpty = true;
            }
            return {
                id: calification.Id,
                owner: calification.Owner,
                evaluatorEmployee: calification.EvaluatorEmployee,
                comments: comment,
                finished: calification.Finished,
                show: ko.observable(self.userView == 0 || (self.userView != 0 && calification.Owner != 0)),
                hasShowIcon: calification.Finished || (calification.EvaluatorEmployee != self.userLogged && calification.Owner != self.userView)
            }
        });
        
        this.evaluation.fromJs(data.Evaluation);

        this.isEvaluationEditable = !this.evaluation.finished && _.some(this.califications, function (calification) {
            return calification.owner == self.userView && !calification.finished;
        });

        this.generalComment = _.find(self.califications, function (calification) {
            return (self.userView == 3 && calification.owner == 3) || (self.userView != 3 && calification.evaluatorEmployee == self.userLogged);
        }).comments;

        if (!this.generalComment() && this.userView == 3) {
            var comments = _.chain(self.califications)
                .filter(function (calification) {
                    return (calification.owner == 1 || calification.owner == 2) && calification.comments() != null;
                })
                .map(function (comment) {
                    return comment.evaluatorEmployee + ": " + comment.comments();
                })
                .value();
            this.generalComment(comments.join("\n\n"));
        };

        var groupNames = {};
        for (var i in data.Template.Groups) {
            var item = data.Template.Groups[i];
            groupNames[item.Key] = item.Value;
        }

        var valuesByKeyCollection = _.map(data.Califications, function (calification) {
            var valuesByKey = {
                calificationColumn: {
                    calificationId: calification.Id,
                    evaluatorEmployee: calification.EvaluatorEmployee,
                    finished: calification.Finished,
                    owner: calification.Owner
                }
            };
            if (calification.Califications) {
                for (var i in calification.Califications) {
                    var cal = calification.Califications[i];
                    valuesByKey[cal.Key] = cal.Value;
                }
            }
            
            return valuesByKey;
        });

        if (this.hasAverageColumn) {
            this.averageCalificationId = "average_column";
            var averageCalificationsColumn = {
                id: this.averageCalificationId,
                owner: 4,
                evaluatorEmployee: "promedio",
                comments: ko.observable(''),
                finished: false,
                show: ko.observable(true),
                hasShowIcon: true
            }

            this.califications.splice(1, 0, averageCalificationsColumn);
        }

        this.groups =_.chain(data.Template.Items)
            .groupBy(function (item) {
                return item.GroupKey;
            })
            .map(function (items, key) {
                var result = {
                    groupKey: key,
                    name: groupNames[key],
                    items: _.map(items, function (item) {
                        var valuesByItem = {
                            key: item.Key,
                            text: item.Text,
                            description: item.Description,
                            values: _.map(valuesByKeyCollection, function (valuesByKey) {
                                var valueItem = {
                                    calificationId: valuesByKey.calificationColumn.calificationId,
                                    value: ko.observable(valuesByKey[item.Key] || ""),
                                    editable: self.isValueEditable(valuesByKey),
                                    owner: valuesByKey.calificationColumn.owner,
                                    showValue: _.find(self.califications, function (calification) {
                                        return calification.id == valuesByKey.calificationColumn.calificationId;
                                    }).show,
                                };
                                valueItem.isValid = ko.computed(function () {
                                    return valueItem.value() === "" || (valueItem.value() >= 1 && valueItem.value() <= 4);
                                })
                                self.isDirty.register(valueItem.value);
                                return valueItem;
                            })
                        };
                        if (self.hasAverageColumn) {
                            var averageValue = {
                                calificationId: self.averageCalificationId,
                                value: ko.computed(function () {
                                    var count, total;
                                    var values = _.filter(valuesByItem.values, function (value) {
                                        return value.owner == 1 || value.owner == 2;
                                    });
                                    for (var i in values) {
                                        if (i == 0) {
                                            count = 0;
                                            total = 0;
                                        }
                                        var value = parseFloat(values[i].value());
                                        if (value) {
                                            count++;
                                            total += value;
                                        }
                                    }
                                    if(total){
                                        return (total / count).toFixed(1);
                                    }
                                    return 0;
                                }),
                                editable: false,
                                showValue: _.find(self.califications, function (calification) {
                                    return calification.id == self.averageCalificationId;
                                }).show,
                            };
                            averageValue.isValid = true;

                            valuesByItem.values.splice(1, 0, averageValue);

                            if (self.isCompanyCalificationsEmpty) {
                                    var companyCalification = _.find(valuesByItem.values, function (calification) {
                                        return calification.owner == 3;
                                    });

                                if (companyCalification) {
                                    companyCalification.value(averageValue.value());
                                }
                            }
                        }
                        return valuesByItem;
                    })
                }
                result.averages = ko.computed(function () {
                    var averages = []
                    for (var i = 0; i < result.items[0].values.length; i++) {
                        for (var key in result.items) {
                            if (!averages[i]) {
                                averages[i] = {
                                    count: 0,
                                    total: 0,
                                    show: self.califications[i].show
                                };
                            }
                            value = parseFloat(result.items[key].values[i].value());
                            if (value) {
                                averages[i].count++;
                                averages[i].total += value;
                            }
                        }
                    }
                    return _.map(averages, function (column) {
                        return {
                            value: (column.total) ? (column.total / column.count).toFixed(1) : 0,
                            show: column.show
                        };
                    });
                });
                return result;
            })
            .value();

        this.calificationsAverages = ko.computed(function () {
            var averages = []
            for (var i = 0; i < self.califications.length; i++) {
                for (var key in self.groups) {
                    if (!averages[i]) {
                        averages[i] = {
                            count: 0,
                            total: 0,
                            show: self.califications[i].show
                        };
                    }
                    value = parseFloat(self.groups[key].averages()[i].value);
                    if (value) {
                        averages[i].count++;
                        averages[i].total += value;
                    }
                }
            }
            return _.map(averages, function (column) {
                return {
                    value: (column.total) ? (column.total / column.count).toFixed(1) : 0,
                    show: column.show
                };
            });
        });
    };

    EvaluationViewModel.prototype.toDto = function (data) {
        var self = this;
        return {
            EvaluationId: this.evaluation.id,
            Project: this.evaluation.project(),
            ToImprove: this.evaluation.improveComment(),
            Strengths: this.evaluation.strengthsComment(),
            ActionPlan: this.evaluation.actionPlanComment(),
            Califications: _.chain(self.califications)
                .filter(function (calification) {
                    return calification.owner == self.userView;
                })
                .map(function(calification) {
                    var calificationItems = _.chain(self.groups)
                        .map(function(group) {
                            var itemsList = _.map(group.items, function(item) {
                                var value = _.find(item.values, function (element) {
                                    return element.calificationId == calification.id;
                                });
                                if (value && value.value()) {
                                    return {
                                        Key: item.key.toString(),
                                        Value: parseFloat(value.value())
                                    }
                                }
                                return;
                            });
                            return _.filter(itemsList, function (item) { return item});
                        })
                        .flatten()
                        .value();
                    return {
                        CalificationId: calification.id,
                        Items: calificationItems,
                        Comments: calification.comments()
                    }
                })
                .value(),
            Finished: false
        }
    }

    EvaluationViewModel.prototype.toggleVisibilityColumn = function (data, event) {
        data.show(!data.show());
    }

    var Evaluation = function (data) {
        this.id = '';
        this.userName = '';
        this.responsibleId = '';
        this.fullName = '';
        this.currentPosition = '';
        this.seniority = '';
        this.period = '';
        this.evaluators = '';
        this.finished = '';
        this.project = ko.observable('');
        this.strengthsComment = ko.observable('');
        this.improveComment = ko.observable('');
        this.actionPlanComment = ko.observable('');
        if (data) {
            this.fromJs(data);
        }
    }
    
    Evaluation.prototype.fromJs = function (data) {
        this.id = data.Id;
        this.userName = data.UserName;
        this.responsibleId = data.ResponsibleId;
        this.fullName = data.FullName;
        this.currentPosition = data.CurrentPosition;
        this.seniority = data.Seniority;
        this.period = data.Period;
        this.finished = data.Finished;
        this.project(data.Project);
        this.strengthsComment(data.StrengthsComment);
        this.improveComment(data.ToImproveComment);
        this.actionPlanComment(data.ActionPlanComment);
        this.evaluators = data.Evaluators.join(', ');
        viewmodel.isDirty.register(this.project);
        viewmodel.isDirty.register(this.strengthsComment);
        viewmodel.isDirty.register(this.improveComment);
        viewmodel.isDirty.register(this.actionPlanComment);
    }

    Evaluation.prototype.onFocusInProject = function (data, event) {
        $(event.target).parent().addClass('edition-enabled');
        return true;
    }
    Evaluation.prototype.onBlurProject = function (data, event) {
        $(event.target).parent().removeClass('edition-enabled');
        if (!this.evaluation.project())
            $(event.target).parent().removeAttr('data-tips');
        return true;
    }
    Evaluation.prototype.onKeyUpProject = function (data, event) {
        if (event.keyCode === 13) {
            $(event.target).blur();
        }
    }
    
    var ModalViewModel = function () {
        this.show = ko.observable(false);
        this.title = ko.observable('');
        this.text = ko.observable('');
        this.isConfirmButtonVisible = ko.observable(false);
    };

    ModalViewModel.prototype.backAction = function () {
        this.show(false);
    }

    ModalViewModel.prototype.confirmAction = function () {
        this.show(false);
        viewmodel.calificationFinished = true;
        viewmodel.onSave(true);
    }

    modalViewModel = new ModalViewModel();
    ko.applyBindings(modalViewModel, document.getElementById('evaluations-generated-confirm'));

    viewmodel = new EvaluationViewModel();
    viewmodel.load();
});